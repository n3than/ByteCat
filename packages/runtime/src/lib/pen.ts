// The pen extension's blocks, as TurboWarp's `scratch3_pen` runs them for its compiler. Each
// target's pen lives on the target (`Target.pen`); the drawing goes to the renderer's pen layer
// (`Runtime.pen`), and a block that draws asks for a redraw only when there is one.
import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { PenState, Target } from "../target.js";

/** The target's pen, made with TurboWarp's defaults (blue, diameter 1, up) on first use. */
export function penOf(t: Target): PenState {
  return (t.pen ??= { down: false, color: 66.66, saturation: 100, brightness: 100, transparency: 0, color4f: [0, 0, 1, 1], size: 1 });
}

export function penClear(rt: Runtime): void {
  if (!rt.pen) return;
  rt.pen.clear();
  rt.requestRedraw();
}

export function stamp(rt: Runtime, t: Target): void {
  if (!rt.pen) return;
  rt.pen.stamp(t);
  rt.requestRedraw();
}

/** Puts the pen down and draws a dot where the target is, as TurboWarp's `_penDown` does. */
export function penDown(rt: Runtime, t: Target): void {
  const pen = penOf(t);
  pen.down = true;
  if (!rt.pen) return;
  rt.pen.line(pen, t.x, t.y, t.x, t.y);
  rt.requestRedraw();
}

export function penUp(t: Target): void {
  penOf(t).down = false;
}

/** "set pen color to (color)": a `#rrggbb` (or `#rgb`) string, or a number as 0xAARRGGBB. */
export function setPenColor(t: Target, color: Value): void {
  const pen = penOf(t);
  let r: number;
  let g: number;
  let b: number;
  if (typeof color === "string" && color.charCodeAt(0) === 35) {
    const hex = color.slice(1);
    const n = parseInt(hex, 16);
    if (Number.isNaN(n) || (hex.length !== 6 && hex.length !== 3)) {
      r = g = b = 0; // An invalid hex color is black.
    } else if (hex.length === 6) {
      r = (n >> 16) & 0xff;
      g = (n >> 8) & 0xff;
      b = n & 0xff;
    } else {
      r = ((n >> 8) & 0xf) * 17;
      g = ((n >> 4) & 0xf) * 17;
      b = (n & 0xf) * 17;
    }
    pen.transparency = 0;
  } else {
    const n = ops.toNum(color);
    const a = (n >> 24) & 0xff;
    r = (n >> 16) & 0xff;
    g = (n >> 8) & 0xff;
    b = n & 0xff;
    pen.transparency = 100 * (1 - (a > 0 ? a : 255) / 255);
  }
  // To HSV, as TurboWarp's `_setPenColorToColor`.
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const x = Math.min(rf, gf, bf);
  const v = Math.max(rf, gf, bf);
  let h = 0;
  let s = 0;
  if (x !== v) {
    const f = rf === x ? gf - bf : gf === x ? bf - rf : rf - gf;
    const i = rf === x ? 3 : gf === x ? 5 : 1;
    h = (i - f / (v - x)) * 60;
    if (h === 360) h = 0;
    s = (v - x) / v;
  }
  pen.color = (h / 360) * 100;
  pen.saturation = s * 100;
  pen.brightness = v * 100;
  updateColor(pen);
}

/**
 * "set pen (param) to (value)" or, with `change`, "change pen (param) by (value)". The color wraps
 * around 0 to 100; the others are clamped to it. An unknown parameter changes nothing.
 */
export function setPenParam(t: Target, param: Value, value: number, change: boolean): void {
  const pen = penOf(t);
  switch (ops.toStr(param)) {
    case "color": {
      const n = value + (change ? pen.color : 0);
      pen.color = n - Math.floor(n / 101) * 101;
      break;
    }
    case "saturation":
      pen.saturation = clamp100(value + (change ? pen.saturation : 0));
      break;
    case "brightness":
      pen.brightness = clamp100(value + (change ? pen.brightness : 0));
      break;
    case "transparency":
      pen.transparency = clamp100(value + (change ? pen.transparency : 0));
      break;
    default:
      return;
  }
  updateColor(pen);
}

/** "set pen size to": clamped to 1 to 1200, TurboWarp's default limits. */
export function setPenSize(t: Target, size: number): void {
  penOf(t).size = Math.min(1200, Math.max(1, size));
}

function clamp100(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** The RGBA a renderer draws with, from the HSV the blocks keep (`_updatePenColor`, `Color.hsvToRgb`). */
function updateColor(pen: PenState): void {
  let h = (pen.color * 360) / 100;
  if (h < 0 || h >= 360) {
    h %= 360;
    if (h < 0) h += 360;
  }
  const s = Math.max(0, Math.min(pen.saturation / 100, 1));
  const v = Math.max(0, Math.min(pen.brightness / 100, 1));
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const u = v * (1 - s * (1 - f));
  const [r, g, b] = i === 1 ? [q, v, p] : i === 2 ? [p, v, u] : i === 3 ? [p, q, v] : i === 4 ? [u, p, v] : i === 5 ? [v, p, q] : [v, u, p];
  pen.color4f[0] = Math.floor(r * 255) / 255;
  pen.color4f[1] = Math.floor(g * 255) / 255;
  pen.color4f[2] = Math.floor(b * 255) / 255;
  pen.color4f[3] = 1 - pen.transparency / 100;
}

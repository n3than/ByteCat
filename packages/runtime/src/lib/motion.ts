import * as ops from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { SLEEP, WAIT } from "../thread.js";

export function setXY(rt: Runtime, t: Target, x: number, y: number): void {
  t.x = x;
  t.y = y;
  if (t.visible) rt.requestRedraw();
}

export function move(rt: Runtime, t: Target, steps: number): void {
  const rad = ((90 - t.direction) * Math.PI) / 180;
  setXY(rt, t, t.x + steps * Math.cos(rad), t.y + steps * Math.sin(rad));
}

export function setDirection(rt: Runtime, t: Target, dir: number): void {
  if (!Number.isFinite(dir)) return;
  t.direction = ops.mod(dir + 179, 360) - 179;
  if (t.visible) rt.requestRedraw();
}

export function* glide(rt: Runtime, t: Target, seconds: number, x: number, y: number): Generator<unknown, void, unknown> {
  const start = rt.liveNow();
  const duration = seconds * 1000;
  const x0 = t.x;
  const y0 = t.y;
  if (duration > 0) {
    // Like TurboWarp, the first step only starts the glide: no move, so no redraw yet.
    yield WAIT;
    for (;;) {
      const now = rt.liveNow();
      const frac = (now - start) / duration;
      if (frac >= 1) break;
      setXY(rt, t, x0 + (x - x0) * frac, y0 + (y - y0) * frac);
      yield WAIT;
      // The virtual clock stands still within a frame, so until the next frame each step would
      // only set the same position again.
      if (rt.options.clock === "virtual") while (rt.liveNow() === now) yield SLEEP;
    }
  }
  setXY(rt, t, x, y);
}

export function bounce(rt: Runtime, t: Target): void {
  // Approximation: treats the sprite as a point. Real bounds need the renderer.
  let dir = t.direction;
  if (t.x > 240 || t.x < -240) dir = -dir;
  if (t.y > 180 || t.y < -180) dir = 180 - dir;
  setXY(rt, t, Math.max(-240, Math.min(240, t.x)), Math.max(-180, Math.min(180, t.y)));
  setDirection(rt, t, dir);
}

/** Scratch hides floating-point noise in x/y reporters. */
export function coord(n: number): number {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? r : n;
}

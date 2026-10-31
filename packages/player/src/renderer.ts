import type { PenLayer, PenState, Runtime, Target } from "@bytecat/runtime";
import { fenceFromBox, type Bounds, type RenderBackend } from "./backend.js";

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

export interface Costume {
  image: CanvasImageSource & { width: number; height: number };
  /** Alpha channel, for pixel-accurate click hit tests. */
  alpha: Uint8ClampedArray;
}

/**
 * Draws the stage, sprites and speech bubbles onto a 2D canvas in Scratch's coordinate system. A
 * `RenderBackend` without pixel-exact collision: `bounds` and `touching` use the costume's box, and
 * `touchingColor` is always false. ScratchRenderBackend (scratch-render.ts) is exact.
 */
export class Renderer implements RenderBackend, PenLayer {
  private readonly ctx: CanvasRenderingContext2D;
  readonly scale: number;
  /** The pen layer, at the canvas's resolution, drawn over the backdrop and under the sprites. */
  private readonly penCanvas: HTMLCanvasElement;
  private readonly penCtx: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly rt: Runtime,
    private readonly costumes: Map<string, Costume>,
    scale = 1,
  ) {
    this.scale = scale;
    canvas.width = STAGE_WIDTH * scale;
    canvas.height = STAGE_HEIGHT * scale;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    this.penCanvas = document.createElement("canvas");
    this.penCanvas.width = canvas.width;
    this.penCanvas.height = canvas.height;
    this.penCtx = this.penCanvas.getContext("2d")!;
    rt.pen = this;
  }

  /** Nothing to copy: `draw` and the queries read the runtime directly. */
  sync(): void {}

  draw(): void {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    this.drawTarget(this.rt.stage);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.penCanvas, 0, 0);
    const sprites = this.sprites();
    for (const t of sprites) if (t.visible) this.drawTarget(t);
    for (const t of sprites) if (t.visible && t.bubble) this.drawBubble(t);
  }

  /** Sprites from back to front. */
  sprites(): Target[] {
    return this.rt.targets.filter((t) => !t.isStage).sort((a, b) => a.layer - b.layer);
  }

  /** Maps the target's costume pixels (top-left origin) to stage canvas coordinates. */
  private transform(t: Target): DOMMatrix {
    const c = t.costumes[t.costume]!;
    let m = new DOMMatrix().translateSelf(STAGE_WIDTH / 2 + t.x, STAGE_HEIGHT / 2 - t.y);
    if (!t.isStage) {
      if (t.rotationStyle === "all around") m = m.rotateSelf(t.direction - 90);
      else if (t.rotationStyle === "left-right" && t.direction < 0) m = m.scaleSelf(-1, 1);
      m = m.scaleSelf(t.size / 100, t.size / 100);
    }
    m = m.scaleSelf(1 / c.bitmapResolution, 1 / c.bitmapResolution).translateSelf(-c.rotationCenterX, -c.rotationCenterY);
    return m;
  }

  private drawTarget(t: Target, ctx = this.ctx): void {
    const info = t.costumes[t.costume];
    const costume = info && this.costumes.get(info.md5ext);
    if (!costume) return;
    ctx.save();
    const m = this.transform(t);
    ctx.setTransform(new DOMMatrix().scaleSelf(this.scale, this.scale).multiplySelf(m));
    ctx.drawImage(costume.image, 0, 0);
    ctx.restore();
  }

  /** Axis-aligned bounds of a sprite on the stage, in canvas (top-left origin) coordinates. */
  private canvasBounds(t: Target): { left: number; top: number; right: number; bottom: number } | null {
    const info = t.costumes[t.costume];
    const costume = info && this.costumes.get(info.md5ext);
    if (!costume) return null;
    const m = this.transform(t);
    const pts = [
      [0, 0], [costume.image.width, 0], [0, costume.image.height], [costume.image.width, costume.image.height],
    ].map(([x, y]) => m.transformPoint({ x: x!, y: y! }));
    return {
      left: Math.min(...pts.map((p) => p.x)),
      right: Math.max(...pts.map((p) => p.x)),
      top: Math.min(...pts.map((p) => p.y)),
      bottom: Math.max(...pts.map((p) => p.y)),
    };
  }

  /** The topmost visible sprite with an opaque pixel at canvas point (x, y), or null for the stage. */
  hit(x: number, y: number): Target | null {
    const sprites = this.sprites().reverse();
    for (const t of sprites) {
      if (!t.visible) continue;
      const info = t.costumes[t.costume];
      const costume = info && this.costumes.get(info.md5ext);
      if (!costume) continue;
      const p = this.transform(t).inverse().transformPoint({ x, y });
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      if (px < 0 || py < 0 || px >= costume.image.width || py >= costume.image.height) continue;
      if (costume.alpha[py * costume.image.width + px]! > 0) return t;
    }
    return null;
  }

  pick(x: number, y: number): Target | null {
    return this.hit(STAGE_WIDTH / 2 + x, STAGE_HEIGHT / 2 - y);
  }

  /** The costume's box on the stage (no pixel test). */
  bounds(t: Target): Bounds | null {
    const b = this.canvasBounds(t);
    return b && { left: b.left - STAGE_WIDTH / 2, right: b.right - STAGE_WIDTH / 2, top: STAGE_HEIGHT / 2 - b.top, bottom: STAGE_HEIGHT / 2 - b.bottom };
  }

  fence(t: Target, x: number, y: number): [number, number] {
    return fenceFromBox(this.bounds(t), t, x, y);
  }

  touching(t: Target, others: readonly Target[]): boolean {
    const a = t.visible ? this.bounds(t) : null;
    if (!a) return false;
    return others.some((o) => {
      const b = o.visible ? this.bounds(o) : null;
      return !!b && a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;
    });
  }

  touchingPoint(t: Target, x: number, y: number): boolean {
    const b = t.visible ? this.bounds(t) : null;
    return !!b && x >= b.left && x <= b.right && y >= b.bottom && y <= b.top;
  }

  touchingColor(): boolean {
    return false;
  }

  costumeSize(t: Target): [number, number] {
    const info = t.costumes[t.costume];
    const costume = info && this.costumes.get(info.md5ext);
    return info && costume ? [costume.image.width / info.bitmapResolution, costume.image.height / info.bitmapResolution] : [0, 0];
  }

  pixel(x: number, y: number): [number, number, number, number] {
    const d = this.ctx.getImageData(Math.floor((STAGE_WIDTH / 2 + x) * this.scale), Math.floor((STAGE_HEIGHT / 2 - y) * this.scale), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]!];
  }

  dispose(): void {
    if (this.rt.pen === this) this.rt.pen = null;
  }

  // ---- pen layer ----

  line(pen: PenState, x0: number, y0: number, x1: number, y1: number): void {
    const ctx = this.penCtx;
    const [r, g, b, a] = pen.color4f;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // Like scratch-render's PenSkin: lines of diameter 1 and 3 are shifted half a pixel so they fill whole pixels.
    const offset = pen.size === 1 || pen.size === 3 ? 0.5 : 0;
    const ax = STAGE_WIDTH / 2 + x0 + offset;
    const ay = STAGE_HEIGHT / 2 - y0 - offset;
    const bx = STAGE_WIDTH / 2 + x1 + offset;
    const by = STAGE_HEIGHT / 2 - y1 - offset;
    const color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    if (ax === bx && ay === by) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ax, ay, pen.size / 2, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = pen.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  stamp(t: Target): void {
    this.drawTarget(t, this.penCtx);
  }

  clear(): void {
    this.penCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.penCtx.clearRect(0, 0, this.penCanvas.width, this.penCanvas.height);
  }

  private drawBubble(t: Target): void {
    const bubble = t.bubble!;
    const b = this.canvasBounds(t);
    if (!b) return;
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.font = "14px Helvetica, Arial, sans-serif";
    const lines = wrap(ctx, bubble.text, 170);
    const lineHeight = 16;
    const width = Math.max(50, ...lines.map((l) => ctx.measureText(l).width)) + 20;
    const height = lines.length * lineHeight + 16;
    let x = b.right;
    if (x + width > STAGE_WIDTH) x = Math.max(0, b.left - width);
    const y = Math.max(0, Math.min(STAGE_HEIGHT - height - 12, b.top - height - 12));
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#a0a0a0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.fill();
    ctx.stroke();
    // Tail pointing back at the sprite.
    ctx.beginPath();
    ctx.moveTo(x + 12, y + height - 1);
    ctx.lineTo(x + 6, y + height + 10);
    ctx.lineTo(x + 26, y + height - 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#575e75";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, x + 10, y + 8 + i * lineHeight));
    ctx.restore();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Decodes costume images (data or blob URLs) and extracts their alpha channels. An image the
 * browser cannot decode is left out and its name passed to `onError`; that costume draws nothing.
 */
export async function loadCostumes(assets: Record<string, string>, onError?: (name: string) => void): Promise<Map<string, Costume>> {
  const entries = await Promise.all(
    Object.entries(assets).map(async ([name, url]) => {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        onError?.(name);
        return null;
      }
      const w = Math.max(1, img.naturalWidth);
      const h = Math.max(1, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8ClampedArray(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
      return [name, { image: canvas, alpha }] as const;
    }),
  );
  return new Map(entries.filter((e) => e !== null));
}

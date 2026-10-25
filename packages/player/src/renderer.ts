import type { Runtime, Target } from "@bytecat/runtime";

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

export interface Costume {
  image: CanvasImageSource & { width: number; height: number };
  /** Alpha channel, for pixel-accurate click hit tests. */
  alpha: Uint8ClampedArray;
}

/** Draws the stage, sprites and speech bubbles onto a 2D canvas in Scratch's coordinate system. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  readonly scale: number;

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
  }

  draw(): void {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    this.drawTarget(this.rt.stage);
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

  private drawTarget(t: Target): void {
    const info = t.costumes[t.costume];
    const costume = info && this.costumes.get(info.md5ext);
    if (!costume) return;
    const { ctx } = this;
    ctx.save();
    const m = this.transform(t);
    ctx.setTransform(new DOMMatrix().scaleSelf(this.scale, this.scale).multiplySelf(m));
    ctx.drawImage(costume.image, 0, 0);
    ctx.restore();
  }

  /** Axis-aligned bounds of a sprite on the stage, in canvas (top-left origin) coordinates. */
  bounds(t: Target): { left: number; top: number; right: number; bottom: number } | null {
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

  private drawBubble(t: Target): void {
    const bubble = t.bubble!;
    const b = this.bounds(t);
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

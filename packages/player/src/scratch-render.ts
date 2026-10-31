// The renderer backend on TurboWarp's scratch-render (WebGL): the same renderer TurboWarp draws
// with, so what Bytecat draws, picks, fences and touches is what TurboWarp would. It mirrors how
// TurboWarp's RenderedTarget and looks blocks drive the renderer: one drawable per target in
// Scratch's layer groups, one skin per costume, direction and scale from the rotation style, and
// speech bubbles placed by the rules of `_positionBubble`.
//
// Bundling it needs the esbuild options in scratch-esbuild.ts.
import type { Runtime, Target } from "@bytecat/runtime";
import { BitmapAdapter } from "@turbowarp/scratch-svg-renderer";
import RenderWebGL from "turbowarp-render";
import type { Bounds, RenderBackend, RGB } from "./backend.js";
import { mimeType } from "./page.js";

/** The renderer itself and the SVG renderer's bitmap adapter, for pages that attach them to TurboWarp's VM. */
export { BitmapAdapter, RenderWebGL };

/**
 * Resolves once every SVG skin of `renderer` has its image decoded. scratch-render sizes an SVG
 * skin at once but sets its rotation center (and draws it) only when the browser has loaded the
 * image, a task later. Until then a sprite sits with its top left corner on its position and
 * cannot be clicked, so anything that steps frames synchronously must wait for this first.
 */
export async function skinsLoaded(renderer: RenderWebGL, timeoutMs = 10_000): Promise<void> {
  const start = performance.now();
  const pending = () => (renderer as unknown as { _allSkins: ({ _svgImageLoaded?: boolean } | undefined)[] })._allSkins.some((s) => s?._svgImageLoaded === false);
  while (pending()) {
    if (performance.now() - start > timeoutMs) throw new Error("costume images did not load");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Scratch's layer groups, back to front (StageLayering in scratch-vm). */
const LAYER_GROUPS = ["background", "video", "pen", "sprite"];
const STAGE_LAYER = "background";
const SPRITE_LAYER = "sprite";

interface Bubble {
  drawable: number;
  skin: number;
  kind: string;
  text: string;
  /** Like TurboWarp's `onSpriteRight`: the bubble sits right of the sprite and points left. */
  onRight: boolean;
}

interface TargetDrawable {
  drawable: number;
  /** Skin ids by costume index. */
  skins: number[];
  bubble: Bubble | null;
}

/** Decodes the project's costume images and makes a skin of each. */
async function loadSkins(renderer: RenderWebGL, target: Target, assets: Record<string, string>): Promise<number[]> {
  return Promise.all(
    target.costumes.map(async (c) => {
      const url = assets[c.md5ext];
      const center: [number, number] = [c.rotationCenterX / c.bitmapResolution, c.rotationCenterY / c.bitmapResolution];
      if (url && mimeType(c.md5ext) === "image/svg+xml") {
        const svg = await (await fetch(url)).text();
        return renderer.createSVGSkin(svg, [c.rotationCenterX, c.rotationCenterY]);
      }
      const img = new Image();
      if (url) {
        img.src = url;
        try {
          await img.decode();
          return renderer.createBitmapSkin(img, c.bitmapResolution, center);
        } catch {
          // An image the browser cannot decode draws nothing, as in the Canvas 2D renderer.
        }
      }
      const empty = document.createElement("canvas");
      empty.width = empty.height = 1;
      return renderer.createBitmapSkin(empty, 1, [0, 0]);
    }),
  );
}

export class ScratchRenderBackend implements RenderBackend {
  readonly renderer: RenderWebGL;
  private readonly drawables = new Map<Target, TargetDrawable>();
  private order: Target[] = [];

  private constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly rt: Runtime,
  ) {
    this.renderer = new RenderWebGL(canvas);
    this.renderer.setLayerGroupOrdering(LAYER_GROUPS);
  }

  /** Creates the renderer on `canvas` and loads every costume. `assets`: data or blob URLs by md5ext. */
  static async create(canvas: HTMLCanvasElement, rt: Runtime, assets: Record<string, string>): Promise<ScratchRenderBackend> {
    const backend = new ScratchRenderBackend(canvas, rt);
    const { renderer } = backend;
    // Targets in project order get drawables in layer order, as TurboWarp's loader does.
    const byLayer = [...rt.targets].sort((a, b) => a.layer - b.layer);
    for (const t of byLayer) {
      const drawable = renderer.createDrawable(t.isStage ? STAGE_LAYER : SPRITE_LAYER);
      backend.drawables.set(t, { drawable, skins: [], bubble: null });
    }
    await Promise.all(byLayer.map(async (t) => (backend.drawables.get(t)!.skins = await loadSkins(renderer, t, assets))));
    await skinsLoaded(renderer);
    backend.sync();
    return backend;
  }

  sync(): void {
    const { renderer } = this;
    if (this.rt.cloneCount > 0 || this.drawables.size !== this.rt.targets.length) this.syncClones();
    for (const [t, d] of this.drawables) this.syncDrawable(t, d);
    // Layer order of the sprites, back to front; only touched when it changed.
    const order = this.rt.targets.filter((t) => !t.isStage).sort((a, b) => a.layer - b.layer);
    if (order.length !== this.order.length || order.some((t, i) => t !== this.order[i])) {
      // Each one to the front of the sprite layer, back to front, leaves them in this order.
      for (const t of order) renderer.setDrawableOrder(this.drawables.get(t)!.drawable, Infinity, SPRITE_LAYER);
      this.order = order;
    }
    for (const [t, d] of this.drawables) this.syncBubble(t, d);
  }

  /** Copies one target into its drawable: costume, position, direction, scale and visibility. */
  private syncDrawable(t: Target, d: TargetDrawable): void {
    const skinId = d.skins[t.costume] ?? d.skins[0];
    // RenderedTarget._getRenderedDirectionAndScale.
    let direction = t.direction;
    let scale: [number, number] = [t.size, t.size];
    if (t.rotationStyle === "don't rotate") direction = 90;
    else if (t.rotationStyle === "left-right") {
      direction = 90;
      scale = [(t.direction < 0 ? -1 : 1) * t.size, t.size];
    }
    this.renderer.updateDrawableProperties(d.drawable, {
      ...(skinId === undefined ? {} : { skinId }),
      position: [t.x, t.y],
      direction: t.isStage ? 90 : direction,
      scale: t.isStage ? [100, 100] : scale,
      visible: t.visible,
    });
  }

  /**
   * The target's drawable brought up to date, for a `Geometry` query in the middle of a frame:
   * only this target is synced (a clone made since the last `sync` gets its drawable now).
   */
  private current(t: Target): TargetDrawable | undefined {
    let d = this.drawables.get(t);
    if (!d && this.rt.targets.includes(t)) {
      this.syncClones();
      d = this.drawables.get(t);
    }
    if (d) this.syncDrawable(t, d);
    return d;
  }

  /**
   * Clones come and go: a new one gets a drawable showing its sprite's skins, and a deleted one's
   * drawable and bubble are destroyed. The layer order is set after this, in `sync`.
   */
  private syncClones(): void {
    const { renderer } = this;
    const live = new Set(this.rt.targets);
    for (const [t, d] of this.drawables) {
      if (live.has(t)) continue;
      renderer.destroyDrawable(d.drawable, SPRITE_LAYER);
      if (d.bubble) {
        renderer.destroyDrawable(d.bubble.drawable, SPRITE_LAYER);
        renderer.destroySkin(d.bubble.skin);
      }
      this.drawables.delete(t);
    }
    for (const t of this.rt.targets) {
      if (this.drawables.has(t)) continue;
      const { skins } = this.drawables.get(this.rt.targets[t.index]!)!;
      this.drawables.set(t, { drawable: renderer.createDrawable(SPRITE_LAYER), skins, bubble: null });
    }
  }

  /** Speech bubbles as TurboWarp's looks blocks draw them (`_renderBubble`, `_positionBubble`). */
  private syncBubble(t: Target, d: TargetDrawable): void {
    const { renderer } = this;
    const bubble = t.visible ? t.bubble : null;
    if (!bubble) {
      if (d.bubble) {
        renderer.destroyDrawable(d.bubble.drawable, SPRITE_LAYER);
        renderer.destroySkin(d.bubble.skin);
        d.bubble = null;
      }
      return;
    }
    if (!d.bubble) {
      const drawable = renderer.createDrawable(SPRITE_LAYER);
      const skin = renderer.createTextSkin(bubble.kind, bubble.text, true);
      renderer.updateDrawableProperties(drawable, { skinId: skin });
      d.bubble = { drawable, skin, kind: bubble.kind, text: bubble.text, onRight: true };
    } else if (d.bubble.kind !== bubble.kind || d.bubble.text !== bubble.text) {
      d.bubble.kind = bubble.kind;
      d.bubble.text = bubble.text;
      renderer.updateTextSkin(d.bubble.skin, bubble.kind, bubble.text, d.bubble.onRight);
    }
    // Bubbles stay in front of every sprite.
    renderer.setDrawableOrder(d.bubble.drawable, Infinity, SPRITE_LAYER);
    const b = d.bubble;
    const [width, height] = renderer.getCurrentSkinSize(b.drawable);
    let target: Bounds;
    try {
      target = renderer.getBoundsForBubble(d.drawable);
    } catch {
      target = { left: t.x, right: t.x, top: t.y, bottom: t.y };
    }
    const flipLeft = b.onRight && width + target.right > 240 && target.left - width > -240;
    const flipRight = !b.onRight && target.left - width < -240 && width + target.right < 240;
    if (flipLeft || flipRight) {
      b.onRight = !b.onRight;
      renderer.updateTextSkin(b.skin, b.kind, b.text, b.onRight);
    }
    const x = b.onRight ? Math.max(-240, Math.min(240 - width, target.right)) : Math.min(240 - width, Math.max(-240, target.left - width));
    renderer.updateDrawablePosition(b.drawable, [x, Math.min(180, target.bottom + height)]);
  }

  draw(): void {
    this.renderer.draw();
  }

  /** Stage coordinates to the canvas's client (CSS pixel) coordinates, which scratch-render's hit tests take. */
  private client(x: number, y: number): [number, number] {
    const w = this.canvas.clientWidth || 480;
    const h = this.canvas.clientHeight || 360;
    return [((x + 240) * w) / 480, ((180 - y) * h) / 360];
  }

  pick(x: number, y: number): Target | null {
    const id = this.renderer.pick(...this.client(x, y));
    for (const [t, d] of this.drawables) if (d.drawable === id) return t.isStage ? null : t;
    return null;
  }

  bounds(t: Target): Bounds | null {
    const d = this.current(t);
    if (!d) return null;
    const b = this.renderer.getBounds(d.drawable);
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  fence(t: Target, x: number, y: number): [number, number] {
    const d = this.current(t);
    return d ? this.renderer.getFencedPositionOfDrawable(d.drawable, [x, y]) : [x, y];
  }

  touching(t: Target, others: readonly Target[]): boolean {
    const d = this.drawables.get(t);
    const candidates = others.map((o) => this.drawables.get(o)?.drawable).filter((id): id is number => id !== undefined);
    return d !== undefined && candidates.length > 0 && this.renderer.isTouchingDrawables(d.drawable, candidates);
  }

  touchingPoint(t: Target, x: number, y: number): boolean {
    const d = this.drawables.get(t);
    return d !== undefined && this.renderer.drawableTouching(d.drawable, ...this.client(x, y));
  }

  touchingColor(t: Target, color: RGB, mask?: RGB): boolean {
    const d = this.drawables.get(t);
    return d !== undefined && this.renderer.isTouchingColor(d.drawable, color, mask);
  }

  costumeSize(t: Target): [number, number] | null {
    const d = this.current(t);
    return d ? this.renderer.getCurrentSkinSize(d.drawable) : null;
  }

  pixel(x: number, y: number): [number, number, number, number] {
    const gl = this.renderer._gl;
    this.renderer.draw();
    const px = Math.floor(((x + 240) / 480) * gl.drawingBufferWidth);
    const py = Math.floor(((y + 180) / 360) * gl.drawingBufferHeight);
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0]!, out[1]!, out[2]!, out[3]!];
  }

  dispose(): void {
    this.renderer._gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

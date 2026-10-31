// A headless stand-in for scratch-render, so that TurboWarp and scratch-vm in Node fence sprites,
// bounce them off the edge and clamp their size, as they do in the editor. Both VMs do none of this
// without a renderer (`if (this.renderer)` in RenderedTarget), and Bytecat's runtime does it once it
// knows its costume sizes, so the headless reference needs a renderer to agree with it.
//
// It is the geometry half of scratch-render's RenderWebGL, ported in its own order of operations:
// one drawable per target with its position (rounded to whole pixels, as Drawable does without
// high quality rendering), direction and scale; skins sized from the costume image like
// SVGSkin/BitmapSkin; the AABB of `Drawable.getAABB`; `getFencedPositionOfDrawable` line for line.
// What it cannot do headless:
//
// - `getBounds` is the AABB. scratch-render shrinks it to the convex hull of the opaque pixels for a
//   visible sprite (a hidden one gets the AABB there too), so `if on edge, bounce` and `touching
//   edge` of a visible sprite can differ by a few pixels (docs/deviations.md).
// - Nothing is drawn or hit-tested: `pick` hits the stage, and touching a sprite or a color is false.
//
// The renderer is attached after the project has loaded (`attachGeometryRenderer`), so the costumes
// load as they do without a renderer (bitmaps need a browser to decode, and the VMs here have no
// storage), and the skins are sized from the costume images measured from the .sb3 instead.
import type { CostumeSizes } from "@bytecat/sb3";

/** What `_step` sees of the page in Node (see `attachGeometryRenderer`). */
const HIDDEN_DOCUMENT = { hidden: true };

/** scratch-render's FENCE_WIDTH. */
const FENCE_WIDTH = 15;

interface TwCostume {
  dataFormat?: string;
  bitmapResolution?: number;
  rotationCenterX: number;
  rotationCenterY: number;
  /** The asset's file name (md5ext). */
  md5?: string;
}

interface TwTarget {
  isStage: boolean;
  drawableID: number | null;
  renderer: unknown;
  currentCostume: number;
  getCostumes(): TwCostume[];
  updateAllDrawableProperties(): void;
}

interface TwRuntime {
  targets: TwTarget[];
  executableTargets: TwTarget[];
  attachRenderer(renderer: unknown): void;
  _step(): void;
  renderer: unknown;
}

/** A skin's size and rotation center, as scratch-render's SVGSkin and BitmapSkin set them. */
interface Skin {
  size: [number, number];
  /** A Float32Array, as twgl makes it. */
  rotationCenter: Float32Array;
}

/** Like scratch-render's Drawable, `position` and `scale` are Float32Arrays (twgl vectors). */
interface Drawable {
  position: Float32Array;
  direction: number;
  scale: Float32Array;
}

const vec = (x: number, y: number) => Float32Array.of(x, y);

/** A rectangle like scratch-render's Rectangle. */
interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What load-costume.js would give the renderer for a costume, from the size of its image. */
function skinOf(costume: TwCostume, sizes: CostumeSizes): Skin | null {
  const size = costume.md5 === undefined ? undefined : sizes[costume.md5];
  if (!size) return null;
  if (costume.dataFormat === "svg") {
    // SVGSkin.setSVG: the viewBox size, and the rotation center less the viewBox origin.
    return { size: [size.width, size.height], rotationCenter: vec(costume.rotationCenterX - size.x, costume.rotationCenterY - size.y) };
  }
  // loadBitmap_ scales a resolution 1 bitmap up to resolution 2, then BitmapSkin divides by 2.
  const resolution = costume.bitmapResolution ?? 1;
  return { size: [size.width / resolution, size.height / resolution], rotationCenter: vec(costume.rotationCenterX / resolution, costume.rotationCenterY / resolution) };
}

export class GeometryRenderer {
  /** RenderWebGL's high quality setting; off, so drawables sit on whole pixels. */
  useHighQualityRender = false;
  offscreenTouching = false;
  private readonly drawables = new Map<number, Drawable>();
  private nextId = 1;
  private readonly skins = new WeakMap<TwCostume, Skin | null>();
  /** The target of each drawable, found on first use. */
  private readonly owners = new Map<number, TwTarget>();
  private readonly xRight = 240;
  private readonly yTop = 180;

  constructor(
    private readonly runtime: TwRuntime,
    private readonly sizes: CostumeSizes,
  ) {}

  // ---- drawables ----

  createDrawable(): number {
    const id = this.nextId++;
    this.drawables.set(id, { position: vec(0, 0), direction: 90, scale: vec(100, 100) });
    return id;
  }

  destroyDrawable(id: number): void {
    this.drawables.delete(id);
    this.owners.delete(id);
  }

  updateDrawablePosition(id: number, position: [number, number]): void {
    const d = this.drawables.get(id);
    if (d) d.position.set([Math.round(position[0]), Math.round(position[1])]);
  }

  updateDrawableDirectionScale(id: number, direction: number, scale: [number, number]): void {
    const d = this.drawables.get(id);
    if (!d) return;
    d.direction = direction;
    d.scale.set(scale);
  }

  updateDrawableProperties(id: number, properties: { position?: [number, number]; direction?: number; scale?: [number, number] }): void {
    const d = this.drawables.get(id);
    if (!d) return;
    if (properties.position) this.updateDrawablePosition(id, properties.position);
    if (properties.direction !== undefined) d.direction = properties.direction;
    if (properties.scale) d.scale.set(properties.scale);
  }

  /** The skin a drawable shows: its target's current costume (skins are not created, see above). */
  private skin(id: number): Skin | null {
    let target = this.owners.get(id);
    if (target?.drawableID !== id) {
      target = this.runtime.targets.find((t) => t.drawableID === id);
      if (target) this.owners.set(id, target);
    }
    const costume = target?.getCostumes()[target.currentCostume];
    if (!costume) return null;
    let skin = this.skins.get(costume);
    if (skin === undefined) this.skins.set(costume, (skin = skinOf(costume, this.sizes)));
    return skin;
  }

  /** Drawable._calculateTransform and Rectangle.initFromModelMatrix. */
  private aabb(id: number): Rect | null {
    const d = this.drawables.get(id);
    const skin = d && this.skin(id);
    if (!d || !skin) return null;
    const rotation = ((270 - d.direction) * Math.PI) / 180;
    const rotationMatrix = new Float32Array(16);
    rotationMatrix[0] = Math.cos(rotation);
    rotationMatrix[1] = Math.sin(rotation);
    rotationMatrix[4] = -Math.sin(rotation);
    rotationMatrix[5] = Math.cos(rotation);
    const center0 = skin.rotationCenter[0]!;
    const center1 = skin.rotationCenter[1]!;
    const [skinSize0, skinSize1] = skin.size;
    const scale0 = d.scale[0]!;
    const scale1 = d.scale[1]!;
    const rotationAdjusted = vec(((center0 - skinSize0 / 2) * scale0) / 100, (((center1 - skinSize1 / 2) * scale1) / 100) * -1);
    const skinScale = vec((skinSize0 * scale0) / 100, (skinSize1 * scale1) / 100);
    const rotation00 = rotationMatrix[0]!;
    const rotation01 = rotationMatrix[1]!;
    const rotation10 = rotationMatrix[4]!;
    const rotation11 = rotationMatrix[5]!;
    const adjusted0 = rotationAdjusted[0]!;
    const adjusted1 = rotationAdjusted[1]!;
    const m = new Float32Array(16);
    m[0] = skinScale[0]! * rotation00;
    m[1] = skinScale[0]! * rotation01;
    m[4] = skinScale[1]! * rotation10;
    m[5] = skinScale[1]! * rotation11;
    m[12] = rotation00 * adjusted0 + rotation10 * adjusted1 + d.position[0]!;
    m[13] = rotation01 * adjusted0 + rotation11 * adjusted1 + d.position[1]!;
    const x = Math.abs(0.5 * m[0]!) + Math.abs(0.5 * m[4]!);
    const y = Math.abs(0.5 * m[1]!) + Math.abs(0.5 * m[5]!);
    return { left: -x + m[12]!, right: x + m[12]!, top: y + m[13]!, bottom: -y + m[13]! };
  }

  // ---- the queries ----

  getBounds(id: number): Rect {
    // scratch-render: the convex hull's bounds for a visible drawable; the AABB here.
    return this.aabb(id) ?? { left: 0, right: 0, top: 0, bottom: 0 };
  }

  getBoundsForBubble(id: number): Rect {
    return this.getBounds(id);
  }

  getFencedPositionOfDrawable(id: number, position: [number, number]): [number, number] {
    let x = position[0];
    let y = position[1];
    const drawable = this.drawables.get(id);
    const aabb = this.aabb(id);
    if (!drawable || !aabb) return [x, y];
    const dx = x - drawable.position[0]!;
    const dy = y - drawable.position[1]!;
    const inset = Math.floor(Math.min(Math.abs(aabb.left - aabb.right), Math.abs(aabb.top - aabb.bottom)) / 2);
    const sx = this.xRight - Math.min(FENCE_WIDTH, inset);
    if (aabb.right + dx < -sx) {
      x = Math.ceil(drawable.position[0]! - (sx + aabb.right));
    } else if (aabb.left + dx > sx) {
      x = Math.floor(drawable.position[0]! + (sx - aabb.left));
    }
    const sy = this.yTop - Math.min(FENCE_WIDTH, inset);
    if (aabb.top + dy < -sy) {
      y = Math.ceil(drawable.position[1]! - (sy + aabb.top));
    } else if (aabb.bottom + dy > sy) {
      y = Math.floor(drawable.position[1]! + (sy - aabb.bottom));
    }
    return [x, y];
  }

  getCurrentSkinSize(id: number): [number, number] {
    return this.skin(id)?.size ?? [0, 0];
  }

  getSkinSize(): [number, number] {
    return [0, 0];
  }

  getNativeSize(): [number, number] {
    return [this.xRight * 2, this.yTop * 2];
  }

  pick(): number {
    return -1;
  }

  isTouchingDrawables(): boolean {
    return false;
  }

  isTouchingColor(): boolean {
    return false;
  }

  drawableTouching(): boolean {
    return false;
  }

  // ---- what draws: nothing to do headless ----

  draw(): void {}
  setLayerGroupOrdering(): void {}
  setDrawableOrder(): number {
    return 0;
  }
  getDrawableOrder(): number {
    return 0;
  }
  updateDrawableVisible(): void {}
  updateDrawableSkinId(): void {}
  updateDrawableEffect(): void {}
  markDrawableAsNoninteractive(): void {}
  setPrivateSkinAccess(): void {}
  setCustomFonts(): void {}
  setUseHighQualityRender(): void {}
  setStageSize(): void {}
  createTextSkin(): number {
    return 0;
  }
  updateTextSkin(): void {}
  createPenSkin(): number {
    return 0;
  }
  penClear(): void {}
  penPoint(): void {}
  penLine(): void {}
  penStamp(): void {}
  destroySkin(): void {}
}

/**
 * Attaches a GeometryRenderer to a loaded TurboWarp or scratch-vm runtime and gives every target a
 * drawable, back to front, as the loader would have with a renderer attached. Clones made later get
 * theirs from the VM itself. `sizes`: the project's costume images (`costumeSizes` in @bytecat/sb3).
 */
export function attachGeometryRenderer(runtime: TwRuntime, sizes: CostumeSizes): GeometryRenderer {
  const renderer = new GeometryRenderer(runtime, sizes);
  runtime.attachRenderer(renderer);
  if (!("document" in globalThis)) {
    // With a renderer TurboWarp's `_step` reads `document.hidden` before it draws. In Node there is
    // no document: lend it a hidden one for the step (nothing would be drawn anyway).
    const step = runtime._step;
    runtime._step = function (this: TwRuntime) {
      const g = globalThis as { document?: unknown };
      g.document = HIDDEN_DOCUMENT;
      try {
        return step.call(this);
      } finally {
        delete g.document;
      }
    };
  }
  const stage = runtime.targets.filter((t) => t.isStage);
  for (const t of [...stage, ...runtime.executableTargets.filter((t) => !t.isStage)]) {
    t.renderer = renderer;
    t.drawableID = renderer.createDrawable();
    t.updateAllDrawableProperties();
  }
  return renderer;
}

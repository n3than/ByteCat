// The questions Scratch answers from its renderer: how far a sprite reaches (bounds), where the
// fence stops it, how large its costume is. `Runtime.geometry` answers them for the blocks (fencing
// in `setXY`, `if on edge, bounce`, the size limits of `set size`). Headless that is `BoxGeometry`,
// which works from the costume sizes measured at load; the player's renderer backends implement
// the same interface (and draw), so with scratch-render behind it the answers are TurboWarp's own
// (docs/architecture.md, "Renderer").
//
// Coordinates are Scratch stage coordinates: origin at the center, x to the right, y up.
import type { CostumeInfo, Target } from "./target.js";

/** A rectangle on the stage, as Scratch's renderer reports it. `top` is greater than `bottom`. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Geometry {
  /** The tight bounds of what the target draws (its costume, turned and scaled), or null if nothing. */
  bounds(t: Target): Bounds | null;
  /** Where Scratch's fence puts the target if it moves to (x, y): it keeps a bit of the sprite on the stage. */
  fence(t: Target, x: number, y: number): [number, number];
  /**
   * The size of the target's current costume at 100%, in stage pixels (for Scratch's size limits),
   * or null when it is not known.
   */
  costumeSize(t: Target): [number, number] | null;
}

/** Half the stage, and how much of a sprite the fence keeps on it at most (scratch-render's FENCE_WIDTH). */
const X_RIGHT = 240;
const Y_TOP = 180;
const FENCE_WIDTH = 15;

/**
 * A target's costume box for one costume, size, direction and rotation style: scratch-render's
 * model matrix less the position. `hx`, `hy` are half the box's width and height, and (`ax`,
 * `ay`) is where its center sits relative to the drawable's position.
 */
interface Box {
  costume: CostumeInfo;
  size: number;
  direction: number;
  style: string;
  hx: number;
  hy: number;
  ax: number;
  ay: number;
}

/**
 * The geometry of the costume's box, the way scratch-render computes a drawable's AABB
 * (`Drawable.getAABB`): the skin's rectangle around its rotation center, scaled, turned by the
 * rendered direction and placed at the drawable's position, which scratch-render rounds to whole
 * pixels. Fencing uses exactly this box in TurboWarp too (`Skin.getFenceBounds`), so `fence` and
 * the size limits match it to the bit. `bounds` is TurboWarp's for a hidden sprite; for a visible
 * one TurboWarp shrinks the box to the convex hull of the costume's opaque pixels, which needs the
 * pixels (docs/deviations.md).
 *
 * Every operation is done in scratch-render's order, so the floating point results, and the
 * `Math.floor`/`Math.ceil` of the fence, are the same. The box is cached on the target for its
 * costume, size, direction and rotation style; only the position changes from call to call.
 */
export class BoxGeometry implements Geometry {
  private readonly boxes = new WeakMap<Target, Box>();

  /** The target's box, or null when its costume's size is unknown. */
  private box(t: Target): Box | null {
    const costume = t.costumes[t.costume];
    if (!costume || costume.width < 0) return null;
    let box = this.boxes.get(t);
    if (box && box.costume === costume && box.size === t.size && box.direction === t.direction && box.style === t.rotationStyle) return box;
    // RenderedTarget._getRenderedDirectionAndScale.
    let direction = t.direction;
    let scale0 = t.size;
    const scale1 = t.size;
    if (t.rotationStyle === "don't rotate") direction = 90;
    else if (t.rotationStyle === "left-right") {
      direction = 90;
      scale0 = (t.direction < 0 ? -1 : 1) * t.size;
    }
    // Drawable._calculateTransform. scratch-render keeps the scale, the rotation center, the
    // matrices and the vectors in between in Float32Arrays (twgl), so each is rounded with `f`.
    const f = Math.fround;
    const rotation = ((270 - direction) * Math.PI) / 180;
    const c = f(Math.cos(rotation));
    const s = f(Math.sin(rotation));
    const { width, height } = costume;
    const centerX = f(costume.centerX);
    const centerY = f(costume.centerY);
    const adjusted0 = f(((centerX - width / 2) * f(scale0)) / 100);
    const adjusted1 = f((((centerY - height / 2) * f(scale1)) / 100) * -1);
    const skin0 = f((width * f(scale0)) / 100);
    const skin1 = f((height * f(scale1)) / 100);
    // Rectangle.initFromModelMatrix, from modelMatrix [0], [1], [4], [5], [12] and [13].
    const m0 = f(skin0 * c);
    const m1 = f(skin0 * s);
    const m4 = f(skin1 * -s);
    const m5 = f(skin1 * c);
    box = {
      costume,
      size: t.size,
      direction: t.direction,
      style: t.rotationStyle,
      hx: Math.abs(0.5 * m0) + Math.abs(0.5 * m4),
      hy: Math.abs(0.5 * m1) + Math.abs(0.5 * m5),
      ax: c * adjusted0 + -s * adjusted1,
      ay: s * adjusted0 + c * adjusted1,
    };
    this.boxes.set(t, box);
    return box;
  }

  bounds(t: Target): Bounds | null {
    const box = this.box(t);
    if (!box) return null;
    const m12 = Math.fround(box.ax + Math.fround(Math.round(t.x)));
    const m13 = Math.fround(box.ay + Math.fround(Math.round(t.y)));
    return { left: -box.hx + m12, right: box.hx + m12, top: box.hy + m13, bottom: -box.hy + m13 };
  }

  /** scratch-render's `getFencedPositionOfDrawable`, with the drawable at the target's position. */
  fence(t: Target, x: number, y: number): [number, number] {
    const box = this.box(t);
    if (!box) return [x, y];
    // The drawable's position: whole pixels, in a Float32Array.
    const p0 = Math.fround(Math.round(t.x));
    const p1 = Math.fround(Math.round(t.y));
    const m12 = Math.fround(box.ax + p0);
    const m13 = Math.fround(box.ay + p1);
    const left = -box.hx + m12;
    const right = box.hx + m12;
    const top = box.hy + m13;
    const bottom = -box.hy + m13;
    const dx = x - p0;
    const dy = y - p1;
    const inset = Math.floor(Math.min(Math.abs(left - right), Math.abs(top - bottom)) / 2);
    const sx = X_RIGHT - Math.min(FENCE_WIDTH, inset);
    if (right + dx < -sx) x = Math.ceil(p0 - (sx + right));
    else if (left + dx > sx) x = Math.floor(p0 + (sx - left));
    const sy = Y_TOP - Math.min(FENCE_WIDTH, inset);
    if (top + dy < -sy) y = Math.ceil(p1 - (sy + top));
    else if (bottom + dy > sy) y = Math.floor(p1 + (sy - bottom));
    return [x, y];
  }

  costumeSize(t: Target): [number, number] | null {
    const costume = t.costumes[t.costume];
    return costume && costume.width >= 0 ? [costume.width, costume.height] : null;
  }
}

/**
 * Where RenderedTarget's `keepInFence` puts a target that wants to be at (x, y): moved just far
 * enough that its bounds lie on the stage. `if on edge, bounce` uses it. Null without bounds.
 */
export function keepInFence(g: Geometry, t: Target, x: number, y: number): [number, number] | null {
  const b = g.bounds(t);
  if (!b) return null;
  const left = b.left + (x - t.x);
  const right = b.right + (x - t.x);
  const top = b.top + (y - t.y);
  const bottom = b.bottom + (y - t.y);
  let dx = 0;
  let dy = 0;
  if (left < -X_RIGHT) dx += -X_RIGHT - left;
  if (right > X_RIGHT) dx += X_RIGHT - right;
  if (top > Y_TOP) dy += Y_TOP - top;
  if (bottom < -Y_TOP) dy += -Y_TOP - bottom;
  return [x + dx, y + dy];
}

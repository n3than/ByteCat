// Bytecat's renderer interface. A backend draws the runtime's targets and answers the questions
// that need what is drawn: which sprite is under a point, how far a sprite reaches, whether two
// sprites touch. Scratch answers these from its renderer, so Bytecat does too (Nathan's decision A,
// docs/architecture.md "Renderer"): today the backend is TurboWarp's scratch-render
// (scratch-render.ts), and another renderer means writing another implementation of this
// interface, nothing more. The Canvas 2D renderer (renderer.ts) implements it too, with bounding
// boxes where it has no pixel test.
//
// All coordinates are Scratch stage coordinates: origin at the center, x to the right, y up, 480 by
// 360 for the default stage.
import type { Target } from "@bytecat/runtime";

/** A rectangle on the stage, as Scratch's renderer reports it. `top` is greater than `bottom`. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type RGB = readonly [number, number, number];

export interface RenderBackend {
  readonly canvas: HTMLCanvasElement;
  /**
   * Copies the runtime's targets into the renderer: position, direction, size, rotation style,
   * costume, visibility, layer order and speech bubbles. Call it before `draw` and before any
   * query once the runtime has changed; the queries read the state of the last `sync`.
   */
  sync(): void;
  /** Draws the stage as of the last `sync`. */
  draw(): void;
  /** The topmost sprite drawn at a stage point, or null for the stage (what a click hits). */
  pick(x: number, y: number): Target | null;
  /** The tight bounds of what the target draws (its costume, turned and scaled), or null if nothing. */
  bounds(t: Target): Bounds | null;
  /** Where Scratch's fence would put the target if it moved to (x, y): it keeps a bit of the sprite on the stage. */
  fence(t: Target, x: number, y: number): [number, number];
  /** Whether the target's drawn pixels overlap those of any of `others`. */
  touching(t: Target, others: readonly Target[]): boolean;
  /** Whether the target has a drawn pixel at a stage point (`touching mouse-pointer`). */
  touchingPoint(t: Target, x: number, y: number): boolean;
  /** Whether the target overlaps a pixel of `color` drawn by anything else (`mask`: only where it has that color). */
  touchingColor(t: Target, color: RGB, mask?: RGB): boolean;
  /** The size of the target's current costume at 100%, in stage pixels (for Scratch's size limits). */
  costumeSize(t: Target): [number, number];
  /** RGBA of the drawn pixel at a stage point, after `draw`. */
  pixel(x: number, y: number): [number, number, number, number];
  dispose(): void;
}

/**
 * Scratch's fence (scratch-render's `getFencedPositionOfDrawable`), from `box`, the axis-aligned
 * box of the target's costume at its current position (not the tight bounds): a sprite moved to
 * (x, y) keeps min(15, half its smaller side) on the stage.
 */
export function fenceFromBox(box: Bounds | null, current: { x: number; y: number }, x: number, y: number): [number, number] {
  if (!box) return [x, y];
  const dx = x - current.x;
  const dy = y - current.y;
  const inset = Math.min(15, Math.floor(Math.min(box.right - box.left, box.top - box.bottom) / 2));
  const sx = 240 - inset;
  const sy = 180 - inset;
  if (box.right + dx < -sx) x = Math.ceil(current.x - (sx + box.right));
  else if (box.left + dx > sx) x = Math.floor(current.x + (sx - box.left));
  if (box.top + dy < -sy) y = Math.ceil(current.y - (sy + box.top));
  else if (box.bottom + dy > sy) y = Math.floor(current.y + (sy - box.bottom));
  return [x, y];
}

// Bytecat's renderer interface. A backend draws the runtime's targets and answers the questions
// that need what is drawn: which sprite is under a point, how far a sprite reaches, whether two
// sprites touch. Scratch answers these from its renderer, so Bytecat does too (Nathan's decision A,
// docs/architecture.md "Renderer"): the queries the blocks ask (bounds, fence, costume size) are
// the runtime's `Geometry` interface, which a backend extends with drawing, picking and touching.
// Today the exact backend is TurboWarp's scratch-render (scratch-render.ts), and another renderer
// means writing another implementation of this interface, nothing more. The Canvas 2D renderer
// (renderer.ts) implements it too, with the costume's box where it has no pixel test.
//
// All coordinates are Scratch stage coordinates: origin at the center, x to the right, y up, 480 by
// 360 for the default stage.
import type { Bounds, Geometry, Target } from "@bytecat/runtime";

export type { Bounds };

export type RGB = readonly [number, number, number];

export interface RenderBackend extends Geometry {
  readonly canvas: HTMLCanvasElement;
  /**
   * Copies the runtime's targets into the renderer: position, direction, size, rotation style,
   * costume, visibility, layer order and speech bubbles. Call it before `draw` and before `pick`
   * or a touching query once the runtime has changed; those read the state of the last `sync`.
   * The `Geometry` queries are answered for the target as it is now, without a `sync`, since the
   * blocks ask them in the middle of a frame.
   */
  sync(): void;
  /** Draws the stage as of the last `sync`. */
  draw(): void;
  /** The topmost sprite drawn at a stage point, or null for the stage (what a click hits). */
  pick(x: number, y: number): Target | null;
  /** Whether the target's drawn pixels overlap those of any of `others`. */
  touching(t: Target, others: readonly Target[]): boolean;
  /** Whether the target has a drawn pixel at a stage point (`touching mouse-pointer`). */
  touchingPoint(t: Target, x: number, y: number): boolean;
  /** Whether the target overlaps a pixel of `color` drawn by anything else (`mask`: only where it has that color). */
  touchingColor(t: Target, color: RGB, mask?: RGB): boolean;
  /** RGBA of the drawn pixel at a stage point, after `draw`. */
  pixel(x: number, y: number): [number, number, number, number];
  dispose(): void;
}

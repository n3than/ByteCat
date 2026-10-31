import type { RuntimeOptions } from "@bytecat/runtime";
import type { Snapshot } from "./snapshot.js";

/** Settings both engines of a trace share. */
export interface FrameOptions {
  /** Frames per second. Default 30. */
  fps?: number;
  /** Turbo mode: a redraw does not end a frame. Default false, like the player. */
  turbo?: boolean;
  /**
   * The work budget of a frame: the most passes over the threads (each pass steps every thread
   * once). It replaces "75% of the frame on the wall clock", which depends on the machine. Default 50.
   */
  passes?: number;
  /** Seed of the generator behind `pick random`. Default 1. */
  seed?: number;
  /** Date.now() at frame 0, in milliseconds since the epoch. Default 1 January 2026, 00:00 UTC. */
  date?: number;
  /**
   * Bytecat's runtime options: a compat preset such as `TURBOWARP`, or `{}` for Bytecat's own
   * defaults. TurboWarp ignores it. Default `EXACT_COMPAT` (the exact trace); the relaxed
   * comparison (`compareEngines`) passes `{}`.
   */
  compat?: Readonly<RuntimeOptions>;
}

/**
 * One engine stepped one frame at a time. The trace drives two of these side by side; a test can
 * wrap one to plant a difference, and a browser-side driver implements the same interface.
 */
export interface LockstepEngine {
  readonly name: string;
  /** Runs one frame. */
  step(): void | Promise<void>;
  /** The visible state now, labelled with `frame`. */
  snapshot(frame: number): Snapshot;
  /** True while any script is running or waiting. */
  readonly running: boolean;
  keyDown(key: string): void;
  keyUp(key: string): void;
  mouseMove(x: number, y: number): void;
  click(x: number, y: number): void;
  /** Questions asked and not answered yet. */
  readonly questions: readonly string[];
  answer(text: string): void | Promise<void>;
  /** Problems that make the run unreliable as a comparison (for example a compiler fallback). */
  readonly problems: readonly string[];
  dispose(): void;
}

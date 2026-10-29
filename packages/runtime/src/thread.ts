import type { Target } from "./target.js";
import type { Runtime } from "./runtime.js";

/**
 * A compiled script body. It yields `undefined` at the end of a loop iteration, `WAIT` or `SLEEP`
 * while it waits on time or a condition, and `BLOCKED` while it cannot go on before a later frame.
 */
export type ScriptFn = (t: Target, th: Thread) => Generator<unknown, void, unknown>;

export type HatKind = "flag" | "broadcast" | "key" | "click";

export interface Hat {
  target: number; // index into project.targets
  kind: HatKind;
  /** Broadcast name (lowercase) or key name. */
  arg?: string;
  /**
   * False when starting the hat while its script runs leaves the script running and drops the
   * new start: TurboWarp's `restartExistingThreads`, false for `when key pressed`. Default true.
   */
  restart?: boolean;
  fn: ScriptFn;
}

/** The function the compiler emits: it receives the runtime and returns every hat script. */
export type ProgramFactory = (rt: Runtime) => Hat[];

/**
 * Yielded while a thread waits on time or a condition (`wait`, `wait until`, `glide`, `broadcast
 * and wait`). TurboWarp's compiled waits yield with the thread still running, so its sequencer
 * goes on with the frame and the wait is checked again on the next pass. `tick` treats this like a
 * loop yield.
 */
export const WAIT = 1;
/**
 * Yielded while a thread cannot go on before a later frame (`ask`), like TurboWarp's
 * STATUS_PROMISE_WAIT and STATUS_YIELD_TICK. It does not keep the frame going: a pass in which
 * every step yields this or ends its thread ends the frame. Other threads can still keep the
 * frame going, and then the thread is stepped again in the same frame, so the code that yields
 * this must check its condition again, with no side effects, and yield it again.
 */
export const BLOCKED = 2;
/**
 * Yielded by a timed wait (`wait`, `say for`) that checked its time again and is not over yet. It
 * keeps the frame going like `WAIT`, but `now()` stands still within a frame, so the wait cannot
 * end before the next one, and the check has no side effects. A pass in which every step yields
 * this or `BLOCKED` therefore changes nothing, and neither would any later pass of the frame:
 * `tick` ends the frame there instead of repeating such passes until the budget runs out, as
 * TurboWarp does. Only the time spent differs. The first yield of a wait is `WAIT`, since the step
 * that reached it may have done work that other threads can see.
 */
export const SLEEP = 3;
export const STOP_ALL = Symbol("stop all");

export class Thread {
  done = false;
  /** Above zero while inside a "run without screen refresh" procedure. */
  warp = 0;
  readonly gen: Generator<unknown, void, unknown>;
  constructor(readonly hat: Hat, readonly target: Target) {
    this.gen = hat.fn(target, this);
  }
}

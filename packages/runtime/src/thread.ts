import type { Target } from "./target.js";
import type { Runtime } from "./runtime.js";

/**
 * A compiled script body. It yields `undefined` at the end of a loop iteration (the thread wants
 * to keep running) and `WAIT` while it is blocked on time or another thread.
 */
export type ScriptFn = (t: Target, th: Thread) => Generator<unknown, void, unknown>;

export type HatKind = "flag" | "broadcast" | "key" | "click";

export interface Hat {
  target: number; // index into project.targets
  kind: HatKind;
  /** Broadcast name (lowercase) or key name. */
  arg?: string;
  fn: ScriptFn;
}

/** The function the compiler emits: it receives the runtime and returns every hat script. */
export type ProgramFactory = (rt: Runtime) => Hat[];

export const WAIT = 1;
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

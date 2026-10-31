import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import { MAX_CLONES, type Runtime } from "../runtime.js";
import { Target } from "../target.js";
import { SLEEP, WAIT, type Thread } from "../thread.js";

// What a script yields and throws, for generated code: `yield WAIT;` while it waits on time or
// another thread, `throw STOP_ALL;` for "stop all", `throw RETIRE;` when a clone deleted itself
// inside a custom block.
export { RETIRE, STOP_ALL, WAIT } from "../thread.js";

export function* wait(rt: Runtime, seconds: number): Generator<unknown, void, unknown> {
  // Elapsed time against the duration, as TurboWarp compares it. `now < start + duration` rounds
  // differently: at 30 fps a 1 second wait started at frame 1 ended a frame early.
  const start = rt.now();
  const duration = seconds * 1000;
  rt.requestRedraw();
  // Always yields once, like TurboWarp; the checks after that are SLEEP (see thread.ts).
  yield WAIT;
  while (rt.now() - start < duration) yield SLEEP;
}

/** "stop other scripts in sprite": ends every thread of `t` except `self`. */
export function stopOthers(rt: Runtime, t: Target, self: Thread): void {
  for (const th of rt.threads) if (th.target === t && th !== self) th.done = true;
  rt.doneListed = true;
  rt.spin = 0;
}

/**
 * "create clone of": a clone of `parent` (a sprite or a clone), unless `parent` is the stage or
 * MAX_CLONES clones exist. It copies the variables, lists, position, look and layer, as
 * TurboWarp's `makeClone` does, and its "when I start as a clone" scripts start.
 */
export function createClone(rt: Runtime, parent: Target): void {
  if (parent.isStage || rt.cloneCount >= MAX_CLONES) return;
  rt.addClone(new Target(parent), parent);
}

/**
 * "create clone of" a menu value known only at run time: `_myself_` clones `t`, a sprite name
 * clones that sprite (the original, as TurboWarp's `getSpriteTargetByName` finds it), and
 * anything else does nothing.
 */
export function createCloneOf(rt: Runtime, t: Target, option: Value): void {
  const name = ops.toStr(option);
  if (name === "_myself_") return createClone(rt, t);
  const parent = rt.targets.find((x) => x.isOriginal && !x.isStage && x.name === name);
  if (parent) createClone(rt, parent);
}

/**
 * "delete this clone": removes `t` and stops its scripts, the running one included. Returns
 * false, doing nothing, for a sprite or the stage. Generated code goes on after false, and after
 * true returns from the script (or throws `RETIRE` inside a custom block).
 */
export function deleteClone(rt: Runtime, t: Target): boolean {
  if (t.isOriginal) return false;
  rt.removeClone(t);
  return true;
}

/**
 * A direct recursive call of a custom reporter outside warp mode. Its arguments are already
 * evaluated in `call`, a generator that has not started; the thread yields unless it is in warp
 * mode, then the call runs. TurboWarp's `yieldThenCallGenerator`.
 */
export function* yieldThenCall<T>(th: Thread, call: Generator<unknown, T, unknown>): Generator<unknown, T, unknown> {
  if (th.warp === 0) yield;
  return yield* call;
}

/** A call of a warp custom reporter that may yield: it runs in warp mode, so its loops never yield. */
export function* callInWarp<T>(th: Thread, call: Generator<unknown, T, unknown>): Generator<unknown, T, unknown> {
  th.warp++;
  try {
    return yield* call;
  } finally {
    th.warp--;
  }
}

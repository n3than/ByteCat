import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import { BLOCKED, WAIT, type Thread } from "../thread.js";

/** Starts every `when I receive` hat for `name` (case-insensitive) and returns the new threads. */
export function broadcast(rt: Runtime, name: Value): Thread[] {
  return rt.startHats("broadcast", ops.toStr(name).toLowerCase());
}

/**
 * Broadcasts, then waits until every script it started has finished. The hats start in this
 * plain function, and only the waiting is a generator: a generator saves its parameters and
 * locals at every yield, and `pingpong` (one broadcast and wait per iteration) spends 1% more
 * instructions when the whole of it is one generator of `(rt, name)`. With no script started it
 * does not yield, as in TurboWarp.
 */
export function broadcastAndWait(rt: Runtime, name: Value): Generator<unknown, void, unknown> {
  return untilDone(rt, broadcast(rt, name));
}

/**
 * TurboWarp's `waitThreads`: it goes on once no started thread is listed in `rt.threads`. A thread
 * that ended, or was stopped by `delete this clone`, stays listed until `tick` filters the list at
 * the end of the pass; a restarted thread (replaced in the list) and `stop all` (a new list) are
 * unlisted at once. While some are listed but every one has ended, the waiter takes
 * STATUS_YIELD_TICK: it yields `BLOCKED` and is not checked again until the next frame. TurboWarp
 * also takes STATUS_YIELD_TICK while the threads still running are all blocked themselves; that
 * part is not modelled (docs/deviations.md, "Found by the trace oracle"). The list is searched
 * only while it may hold a done thread (`rt.doneListed`): searching it on every check cost
 * `pingpong` 0.5% more instructions, and a named function in place of the arrow for `some` 1.7%.
 */
function* untilDone(rt: Runtime, started: Thread[]): Generator<unknown, void, unknown> {
  if (started.length === 0) return;
  do yield WAIT;
  while (started.some((th) => !th.done) || (rt.doneListed && listed(rt, started) && (yield* tickWait(rt, started))));
}

/** Whether a started thread is still in `rt.threads`, where only ended ones can be by now. */
function listed(rt: Runtime, started: Thread[]): boolean {
  const threads = rt.threads;
  for (let i = 0; i < threads.length; i++) if (threads[i]!.done && started.includes(threads[i]!)) return true;
  return false;
}

/**
 * STATUS_YIELD_TICK: yields `BLOCKED` until the next frame, then checks again at once, as
 * `waitThreads` does when its thread resumes. Returns whether a started thread still runs, so the
 * caller yields and checks again, or (false) that none is listed any more, so it goes on.
 */
function* tickWait(rt: Runtime, started: Thread[]): Generator<unknown, boolean, unknown> {
  for (;;) {
    const frame = rt.frame;
    do yield BLOCKED;
    while (rt.frame === frame);
    if (started.some((th) => !th.done)) return true;
    if (!listed(rt, started)) return false;
  }
}

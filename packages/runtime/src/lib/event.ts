import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import { WAIT, type Thread } from "../thread.js";

/** Starts every `when I receive` hat for `name` (case-insensitive) and returns the new threads. */
export function broadcast(rt: Runtime, name: Value): Thread[] {
  return rt.startHats("broadcast", ops.toStr(name).toLowerCase());
}

/**
 * Broadcasts, then waits until every script it started has finished. The hats start in this
 * plain function, and only the waiting is a generator that holds nothing but the threads: a
 * generator saves its parameters and locals at every yield, and `pingpong` (one broadcast and
 * wait per iteration) spends 1% more instructions when the whole of it is one generator of
 * `(rt, name)`.
 */
export function broadcastAndWait(rt: Runtime, name: Value): Generator<unknown, void, unknown> {
  return untilDone(broadcast(rt, name));
}

function* untilDone(started: Thread[]): Generator<unknown, void, unknown> {
  do yield WAIT;
  while (started.some((th) => !th.done));
}

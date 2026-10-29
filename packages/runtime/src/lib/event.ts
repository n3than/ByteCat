import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import { WAIT, type Thread } from "../thread.js";

/** Starts every `when I receive` hat for `name` (case-insensitive) and returns the new threads. */
export function broadcast(rt: Runtime, name: Value): Thread[] {
  return rt.startHats("broadcast", ops.toStr(name).toLowerCase());
}

export function* broadcastAndWait(rt: Runtime, name: Value): Generator<unknown, void, unknown> {
  const started = broadcast(rt, name);
  do yield WAIT;
  while (started.some((th) => !th.done));
}

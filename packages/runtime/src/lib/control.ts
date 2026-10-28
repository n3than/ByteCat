import type { Runtime } from "../runtime.js";
import { WAIT } from "../thread.js";

export function* wait(rt: Runtime, seconds: number): Generator<unknown, void, unknown> {
  const end = rt.now() + seconds * 1000;
  rt.requestRedraw();
  do yield WAIT;
  while (rt.now() < end);
}

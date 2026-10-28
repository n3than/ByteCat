import type { Runtime } from "../runtime.js";
import { WAIT } from "../thread.js";

export function* wait(rt: Runtime, seconds: number): Generator<unknown, void, unknown> {
  // Elapsed time against the duration, as TurboWarp compares it. `now < start + duration` rounds
  // differently: at 30 fps a 1 second wait started at frame 1 ended a frame early.
  const start = rt.now();
  const duration = seconds * 1000;
  rt.requestRedraw();
  do yield WAIT;
  while (rt.now() - start < duration);
}

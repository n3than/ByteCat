import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { WAIT, type Thread } from "../thread.js";

// What a script yields and throws, for generated code: `yield WAIT;` while it waits on time or
// another thread, `throw STOP_ALL;` for "stop all".
export { STOP_ALL, WAIT } from "../thread.js";

export function* wait(rt: Runtime, seconds: number): Generator<unknown, void, unknown> {
  // Elapsed time against the duration, as TurboWarp compares it. `now < start + duration` rounds
  // differently: at 30 fps a 1 second wait started at frame 1 ended a frame early.
  const start = rt.now();
  const duration = seconds * 1000;
  rt.requestRedraw();
  do yield WAIT;
  while (rt.now() - start < duration);
}

/** "stop other scripts in sprite": ends every thread of `t` except `self`. */
export function stopOthers(rt: Runtime, t: Target, self: Thread): void {
  for (const th of rt.threads) if (th.target === t && th !== self) th.done = true;
  rt.spin = 0;
}

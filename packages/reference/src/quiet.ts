import { createRequire } from "node:module";

// TurboWarp's shared logger binds console methods when it loads, so swapping console in silenced()
// does not reach it; silenced() swaps the logger's methods too.
const twLog = createRequire(import.meta.url)("turbowarp-vm/src/util/log") as Record<string, unknown>;
const twLogLevels = ["debug", "log", "info", "warn", "warning"];

/**
 * scratch-vm logs noisy warnings at startup and about the missing renderer; hide them while it sets
 * up. Errors still print, and TurboWarp's compiler warnings print while the project runs.
 */
export async function silenced<T>(fn: () => Promise<T>): Promise<T> {
  const { log, warn, info } = console;
  const tw = Object.fromEntries(twLogLevels.map((level) => [level, twLog[level]]));
  console.log = console.warn = console.info = () => {};
  for (const level of twLogLevels) twLog[level] = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, info });
    Object.assign(twLog, tw);
  }
}

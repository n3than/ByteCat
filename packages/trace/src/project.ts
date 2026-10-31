// The oracles in Node: Bytecat against headless TurboWarp.
import { costumeSizes, readSb3 } from "@bytecat/sb3";
import { BytecatLockstep } from "./bytecat.js";
import { compareEngines, type CompareOptions, type CompareResult } from "./compare.js";
import { traceEngines, type TraceOptions, type TraceResult } from "./trace.js";
import { TurboWarpEngine } from "./turbowarp.js";

/** Traces an .sb3 on Bytecat (actual, with `EXACT_COMPAT` unless `compat` is given) against TurboWarp (expected). */
export async function traceProject(sb3: Uint8Array, options: TraceOptions): Promise<TraceResult> {
  // Bytecat reads the project back from the bytes, like the CLI, so both engines see the same data.
  const project = readSb3(sb3);
  const bytecat = new BytecatLockstep(project.json, options, costumeSizes(project));
  const turbowarp = await TurboWarpEngine.load(sb3, options);
  try {
    return await traceEngines(bytecat, turbowarp, options);
  } finally {
    bytecat.dispose();
    turbowarp.dispose();
  }
}

/**
 * The relaxed comparison of an .sb3: Bytecat with its own defaults (no compat preset unless
 * `compat` is given) against TurboWarp, at checkpoints (`compareEngines`).
 */
export async function compareProject(sb3: Uint8Array, options: CompareOptions): Promise<CompareResult> {
  const project = readSb3(sb3);
  const bytecat = new BytecatLockstep(project.json, { ...options, compat: options.compat ?? {} }, costumeSizes(project));
  const turbowarp = await TurboWarpEngine.load(sb3, options);
  try {
    return await compareEngines(bytecat, turbowarp, options);
  } finally {
    bytecat.dispose();
    turbowarp.dispose();
  }
}

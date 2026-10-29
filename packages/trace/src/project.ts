// The trace oracle in Node: Bytecat against headless TurboWarp.
import { readSb3 } from "@bytecat/sb3";
import { BytecatLockstep } from "./bytecat.js";
import { traceEngines, type TraceOptions, type TraceResult } from "./trace.js";
import { TurboWarpEngine } from "./turbowarp.js";

/** Traces an .sb3 on Bytecat (actual) against TurboWarp (expected). */
export async function traceProject(sb3: Uint8Array, options: TraceOptions): Promise<TraceResult> {
  // Bytecat reads the project back from the bytes, like the CLI, so both engines see the same data.
  const bytecat = new BytecatLockstep(readSb3(sb3).json, options);
  const turbowarp = await TurboWarpEngine.load(sb3, options);
  try {
    return await traceEngines(bytecat, turbowarp, options);
  } finally {
    bytecat.dispose();
    turbowarp.dispose();
  }
}

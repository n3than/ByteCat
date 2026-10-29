// Headless TurboWarp in Node as a lockstep engine (the browser oracle has its own loader, see
// browser/page.ts).
import { mulberry32, TurboWarpLockstep } from "@bytecat/reference";
import type { FrameOptions } from "./engine.js";
import { TurboWarpEngineCore } from "./turbowarp-engine.js";

export class TurboWarpEngine extends TurboWarpEngineCore {
  static async load(sb3: Uint8Array, options: FrameOptions = {}): Promise<TurboWarpEngine> {
    const { seed = 1, ...rest } = options;
    return new TurboWarpEngine(await TurboWarpLockstep.load(sb3, { ...rest, random: mulberry32(seed) }));
  }
}

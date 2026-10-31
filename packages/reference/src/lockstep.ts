// Node side of the lockstep driver (tw-lockstep.ts): loads TurboWarp from node_modules, with the
// counter ids of tw-ids.ts, and runs it headless with scratch-render's geometry (tw-geometry.ts),
// which also makes it request redraws where it would with its real renderer.
import "./tw-ids.js";
import { createRequire } from "node:module";
import TurboWarpVM from "turbowarp-vm";
import { silenced } from "./quiet.js";
import { costumeSizes, readSb3 } from "@bytecat/sb3";
import { attachGeometryRenderer } from "./tw-geometry.js";
import { patchTurboWarp, TurboWarpLockstepCore, type LockstepOptions } from "./tw-lockstep.js";

const require = createRequire(import.meta.url);

export class TurboWarpLockstep extends TurboWarpLockstepCore {
  /** Loads the project headless and clicks the green flag. Nothing runs until the first `step()`. */
  static async load(sb3: Uint8Array, options: LockstepOptions = {}): Promise<TurboWarpLockstep> {
    patchTurboWarp({
      Timer: require("turbowarp-vm/src/util/timer"),
      Looks: require("turbowarp-vm/src/blocks/scratch3_looks"),
    });
    const vm = await silenced(async () => new TurboWarpVM());
    const lockstep = new TurboWarpLockstep(vm, options);
    await silenced(() => vm.loadProject(sb3));
    attachGeometryRenderer(vm.runtime as never, costumeSizes(readSb3(sb3)));
    lockstep.start();
    return lockstep;
  }
}

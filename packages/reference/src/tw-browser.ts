// For browser bundles only (the browser oracle, packages/trace/src/browser): TurboWarp's VM and the
// modules the lockstep driver patches, imported the way a bundler resolves them. The bundle swaps
// `util/uid.js` for a counter (`turbowarpUidReplacement` in tw-ids.ts), as tw-ids.ts does in Node.
import TurboWarpVM from "turbowarp-vm";
import Timer from "turbowarp-vm/src/util/timer.js";
import RenderedTarget from "turbowarp-vm/src/sprites/rendered-target.js";
import Looks from "turbowarp-vm/src/blocks/scratch3_looks.js";
import uid from "turbowarp-vm/src/util/uid.js";
import type { TurboWarpModules } from "./tw-lockstep.js";

export { TurboWarpVM };

export const turbowarpModules: TurboWarpModules = { Timer, RenderedTarget, Looks };

/** True when the bundle swapped TurboWarp's ids for the counter. */
export function turbowarpUsesCounterIds(): boolean {
  return /^bc-uid-\d+$/.test(uid());
}

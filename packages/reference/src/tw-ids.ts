// TurboWarp makes every new id (targets and clones, variables, comments, the usage id of every say
// bubble) with `util/uid.js`, which draws 20 characters from Math.random. The trace oracle seeds
// Math.random so that `pick random` gives the same numbers on Bytecat and TurboWarp, and Bytecat
// never draws for ids, so TurboWarp's ids must not draw either. Every module that needs an id does
// `const uid = require('../util/uid')` when it loads, so the counter has to be in Node's module
// cache before TurboWarp loads: index.ts imports this file before it imports turbowarp-vm.
//
// The ids stay unique in the process (one counter for every VM) and are never visible to a project.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module") as {
  new (id: string): NodeJS.Module;
};

const path = require.resolve("turbowarp-vm/src/util/uid");
let next = 0;
const counterUid = (): string => `bc-uid-${++next}`;

if (!require.cache[path]) {
  const m = new Module(path);
  m.filename = path;
  m.loaded = true;
  m.exports = counterUid;
  require.cache[path] = m;
}

/** True when TurboWarp got the counter (it loaded after this file). Checked by a test. */
export function turbowarpUsesCounterIds(): boolean {
  return require(path) === counterUid;
}

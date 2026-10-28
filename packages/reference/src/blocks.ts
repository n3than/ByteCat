import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** TurboWarp's metadata for a hat, from a block module's `getHats`. */
export interface TurboWarpHat {
  restartExistingThreads?: boolean;
  edgeActivated?: boolean;
}

/** The opcodes one of TurboWarp's block modules implements. */
export interface TurboWarpBlocks {
  /** The module: a core category file (`motion`, `operators`, ...) or an extension (`pen`). */
  module: string;
  /** Opcodes from `getPrimitives`, or for an extension the blocks and menus `getInfo` declares. */
  primitives: string[];
  /** Hats from `getHats`, with their metadata. */
  hats: Record<string, TurboWarpHat>;
}

/** The core block modules in TurboWarp's `src/blocks/` (scratch3_NAME.js). */
const CORE = ["motion", "looks", "sound", "event", "control", "sensing", "operators", "data", "procedures"];
/** The extensions in `src/extensions/` that Bytecat inventories. */
const EXTENSIONS = ["pen"];

/** A runtime that is enough for the block modules' constructors, which only subscribe to events. */
const runtime = { on() {}, addListener() {}, ioDevices: {}, getTargetForStage() {}, _hats: {} };

interface BlockModule {
  getPrimitives(): Record<string, unknown>;
  getHats?(): Record<string, TurboWarpHat>;
}

interface ExtensionModule {
  getInfo(): {
    id: string;
    blocks: (string | { opcode?: string })[];
    menus?: Record<string, unknown>;
  };
}

/**
 * Every opcode TurboWarp knows in the core block modules and in the inventoried extensions, read
 * from the `turbowarp-vm` dependency. Bytecat's block inventory is checked against it.
 */
export function turbowarpBlocks(): TurboWarpBlocks[] {
  const out: TurboWarpBlocks[] = [];
  for (const module of CORE) {
    const Blocks = require(`turbowarp-vm/src/blocks/scratch3_${module}.js`) as new (rt: unknown) => BlockModule;
    const blocks = new Blocks(runtime);
    out.push({ module, primitives: Object.keys(blocks.getPrimitives()), hats: { ...blocks.getHats?.() } });
  }
  for (const module of EXTENSIONS) {
    const Extension = require(`turbowarp-vm/src/extensions/scratch3_${module}/index.js`) as new (rt: unknown) => ExtensionModule;
    // getInfo formats every label, and warns about each translation the headless VM lacks.
    const { warn } = console;
    console.warn = () => {};
    let info: ReturnType<ExtensionModule["getInfo"]>;
    try {
      info = new Extension(runtime).getInfo();
    } finally {
      console.warn = warn;
    }
    const opcodes = info.blocks.flatMap((b) => (typeof b === "object" && b.opcode ? [`${info.id}_${b.opcode}`] : []));
    const menus = Object.keys(info.menus ?? {}).map((name) => `${info.id}_menu_${name}`);
    out.push({ module, primitives: [...opcodes, ...menus], hats: {} });
  }
  return out;
}

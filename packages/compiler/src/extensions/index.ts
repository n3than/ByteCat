import { argument } from "./argument.js";
import { control } from "./control.js";
import { data } from "./data.js";
import { event } from "./event.js";
import { looks } from "./looks.js";
import { motion } from "./motion.js";
import { operator } from "./operator.js";
import { pen } from "./pen.js";
import { procedures } from "./procedures.js";
import { ExtensionRegistry } from "./registry.js";
import { sensing } from "./sensing.js";
import { sound } from "./sound.js";
import type { Extension } from "./api.js";

export * from "./api.js";
export { ExtensionRegistry, checkExtension, compiles } from "./registry.js";

/** Every extension Bytecat ships, in Scratch's palette order. */
export const BUILTIN_EXTENSIONS: readonly Extension[] = [
  motion, looks, sound, event, control, sensing, operator, data, procedures, argument, pen,
];

/** The registry of the built-in extensions, which `compileProject` uses unless given more. */
export const builtins = new ExtensionRegistry(BUILTIN_EXTENSIONS);

// Every module generated code imports from, keyed by the specifier it imports it with. Only `load`
// (in @bytecat/compiler) and the full player read this table. A bundled project imports the
// modules it uses by specifier instead, so the rest are left out of it.
import * as control from "./lib/control.js";
import * as event from "./lib/event.js";
import * as looks from "./lib/looks.js";
import * as motion from "./lib/motion.js";
import * as pen from "./lib/pen.js";
import * as sensing from "./lib/sensing.js";
import * as ops from "./ops.js";

export const RUNTIME_MODULES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "@bytecat/runtime/control": control,
  "@bytecat/runtime/event": event,
  "@bytecat/runtime/looks": looks,
  "@bytecat/runtime/motion": motion,
  "@bytecat/runtime/ops": ops,
  "@bytecat/runtime/pen": pen,
  "@bytecat/runtime/sensing": sensing,
};

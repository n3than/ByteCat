import { BOOL } from "../analysis/typeset.js";
import { anyEx, lit } from "../cast.js";
import { boolean, reporter, type Extension } from "./api.js";

/** Boolean argument names that report true where no parameter has them: "is compiled?" and "is TurboWarp?". */
export const COMPILED_FLAGS: ReadonlySet<string> = new Set(["is compiled?", "is turbowarp?"]);

/** The parameters of custom blocks, read inside their definitions. */
export const argument: Extension = {
  id: "argument",
  name: "My Blocks: arguments",
  blocks: {
    argument_reporter_string_number: reporter((b, g) => {
      const name = g.field(b, "VALUE");
      const p = g.param(name);
      return p ? anyEx(p, g.paramType(name)) : lit("0");
    }),
    argument_reporter_boolean: boolean(
      (b, g) => {
        const name = g.field(b, "VALUE");
        const p = g.param(name);
        if (p) return anyEx(p, g.paramType(name));
        // TurboWarp's compiler answers true for these two names outside a custom block that has
        // them, so projects can tell they run compiled and take their fast path.
        return { c: String(COMPILED_FLAGS.has(name.toLowerCase())), t: BOOL };
      },
      { note: 'outside a custom block, "is compiled?" and "is TurboWarp?" read true; known fuzzer finding: an empty boolean slot reads as "" instead of false' },
    ),
  },
};

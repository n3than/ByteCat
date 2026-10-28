import { BOOL } from "../analysis/typeset.js";
import { anyEx, lit } from "../cast.js";
import { boolean, reporter, type Extension } from "./api.js";

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
        return p ? anyEx(p, g.paramType(name)) : { c: "false", t: BOOL };
      },
      { note: 'known fuzzer finding: an empty boolean slot reads as "" instead of false' },
    ),
  },
};

import type { Block } from "@bytecat/sb3";
import type { Gen } from "../types.js";
import { POS_INT, STR_TEXT, WHOLE_INDEX, ZERO, within } from "../analysis/typeset.js";
import { anyEx, asAny, asNum, boolEx, effectful, indexMinusOne, numEx, simple, strEx, sumType } from "../cast.js";
import { boolean, reporter, statement, type Extension } from "./api.js";

/** The ITEM input of a list block, recorded as a possible item of the list. */
function item(b: Block, g: Gen): string {
  const e = g.input(b, "ITEM");
  g.noteListWrite(b.fields.LIST, e.t);
  return asAny(e);
}

const NO_MONITORS = "compiles to nothing; no monitors are drawn";

export const data: Extension = {
  id: "data",
  name: "Variables and lists",
  blocks: {
    data_variable: reporter((b, g) => anyEx(g.variable(b.fields.VARIABLE), g.varType(b.fields.VARIABLE))),
    data_setvariableto: statement((b, g) => {
      const value = g.input(b, "VALUE");
      g.noteWrite(b.fields.VARIABLE, value.t);
      return [`${g.variable(b.fields.VARIABLE)} = ${asAny(value)};`];
    }),
    data_changevariableby: statement((b, g) => {
      const v = anyEx(g.variable(b.fields.VARIABLE), g.varType(b.fields.VARIABLE));
      const by = g.input(b, "VALUE");
      g.noteWrite(b.fields.VARIABLE, sumType(v, by));
      return [`${v.c} = ${asNum(v)} + ${asNum(by)};`];
    }),
    data_showvariable: statement(() => [], { partial: NO_MONITORS }),
    data_hidevariable: statement(() => [], { partial: NO_MONITORS }),
    data_listcontents: reporter((b, g) => strEx(`listContents(${g.list(b.fields.LIST)})`), { uses: ["listContents"] }),
    data_addtolist: statement((b, g) => [`${g.list(b.fields.LIST)}.push(${item(b, g)});`]),
    data_deleteoflist: statement((b, g) => [`deleteOf(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")});`], { uses: ["deleteOf"] }),
    data_deletealloflist: statement((b, g) => [`${g.list(b.fields.LIST)}.length = 0;`]),
    data_insertatlist: statement((b, g) => [`insertAt(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")}, ${item(b, g)});`], {
      uses: ["insertAt"],
    }),
    data_replaceitemoflist: statement(
      (b, g) => {
        const list = g.list(b.fields.LIST);
        const index = g.input(b, "INDEX");
        const itemEx = g.input(b, "ITEM");
        g.noteListWrite(b.fields.LIST, itemEx.t);
        // An index >= 1 is in range exactly when `i <= length` (never for Infinity); one that may be
        // 0 also needs `i > 0` (a variable that starts at 0 and counts up). The helper evaluates the item whether or not
        // it is stored, so the item must not draw random numbers or read a clock, since the guarded
        // store may skip it. The index is evaluated once, and before the item.
        if (!within(index.t, WHOLE_INDEX) || effectful(itemEx)) return [`replaceAt(${list}, ${asAny(index)}, ${asAny(itemEx)});`];
        const inRange = (i: string) => `${index.t & ZERO ? `${i} > 0 && ` : ""}${i} <= ${list}.length`;
        if (simple(index)) return [`if (${inRange(asAny(index))}) ${list}[${indexMinusOne(index)}] = ${asAny(itemEx)};`];
        const i = g.tmp();
        return [`{ const ${i} = ${index.c}; if (${inRange(i)}) ${list}[${i} - 1] = ${asAny(itemEx)}; }`];
      },
      { uses: ["replaceAt"] },
    ),
    // An index out of range gives "".
    data_itemoflist: reporter(
      (b, g) => {
        const list = g.list(b.fields.LIST);
        const index = g.input(b, "INDEX");
        const t = g.listType(b.fields.LIST) | STR_TEXT;
        // An integer index past the end, 0 (reading `list[-1]`) or Infinity gives `undefined`, which
        // becomes "" (a list never holds undefined).
        if (within(index.t, WHOLE_INDEX)) return anyEx(`(${list}[${indexMinusOne(index)}] ?? "")`, t);
        return anyEx(`itemOf(${list}, ${asAny(index)})`, t);
      },
      { uses: ["itemOf"] },
    ),
    data_itemnumoflist: reporter(
      (b, g) => numEx(`indexOf(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`, POS_INT | ZERO),
      { uses: ["indexOf"] },
    ),
    data_lengthoflist: reporter((b, g) => numEx(`${g.list(b.fields.LIST)}.length`, POS_INT | ZERO)),
    data_listcontainsitem: boolean((b, g) => boolEx(`listContains(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`), {
      uses: ["listContains"],
    }),
    data_showlist: statement(() => [], { partial: "compiles to nothing; no list monitors are drawn" }),
    data_hidelist: statement(() => [], { partial: "compiles to nothing; no list monitors are drawn" }),
  },
};

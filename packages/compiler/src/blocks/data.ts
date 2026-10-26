import type { Block } from "@bytecat/sb3";
import type { Gen, ReporterHandler, StatementHandler } from "../types.js";
import { POS_INT, STR_TEXT, WHOLE_INDEX, ZERO, within } from "../analysis/typeset.js";
import { anyEx, asAny, asNum, boolEx, effectful, indexMinusOne, numEx, simple, strEx, sumType } from "../cast.js";

/** The ITEM input of a list block, recorded as a possible item of the list. */
function item(b: Block, g: Gen): string {
  const e = g.input(b, "ITEM");
  g.noteListWrite(b.fields.LIST, e.t);
  return asAny(e);
}

export const dataStatements: Record<string, StatementHandler> = {
  data_setvariableto: (b, g) => {
    const value = g.input(b, "VALUE");
    g.noteWrite(b.fields.VARIABLE, value.t);
    return [`${g.variable(b.fields.VARIABLE)} = ${asAny(value)};`];
  },
  data_changevariableby: (b, g) => {
    const v = anyEx(g.variable(b.fields.VARIABLE), g.varType(b.fields.VARIABLE));
    const by = g.input(b, "VALUE");
    g.noteWrite(b.fields.VARIABLE, sumType(v, by));
    return [`${v.c} = ${asNum(v)} + ${asNum(by)};`];
  },
  data_addtolist: (b, g) => [`${g.list(b.fields.LIST)}.push(${item(b, g)});`],
  data_deleteoflist: (b, g) => [`deleteOf(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")});`],
  data_deletealloflist: (b, g) => [`${g.list(b.fields.LIST)}.length = 0;`],
  data_insertatlist: (b, g) => [`insertAt(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")}, ${item(b, g)});`],
  data_replaceitemoflist: (b, g) => {
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
  data_showvariable: () => [],
  data_hidevariable: () => [],
  data_showlist: () => [],
  data_hidelist: () => [],
};

export const dataReporters: Record<string, ReporterHandler> = {
  data_variable: (b, g) => anyEx(g.variable(b.fields.VARIABLE), g.varType(b.fields.VARIABLE)),
  data_listcontents: (b, g) => strEx(`listContents(${g.list(b.fields.LIST)})`),
  // An index out of range gives "".
  data_itemoflist: (b, g) => {
    const list = g.list(b.fields.LIST);
    const index = g.input(b, "INDEX");
    const t = g.listType(b.fields.LIST) | STR_TEXT;
    // An integer index past the end, 0 (reading `list[-1]`) or Infinity gives `undefined`, which
    // becomes "" (a list never holds undefined).
    if (within(index.t, WHOLE_INDEX)) return anyEx(`(${list}[${indexMinusOne(index)}] ?? "")`, t);
    return anyEx(`itemOf(${list}, ${asAny(index)})`, t);
  },
  data_lengthoflist: (b, g) => numEx(`${g.list(b.fields.LIST)}.length`, POS_INT | ZERO),
  data_listcontainsitem: (b, g) => boolEx(`listContains(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`),
  data_itemnumoflist: (b, g) => numEx(`indexOf(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`, POS_INT | ZERO),
};

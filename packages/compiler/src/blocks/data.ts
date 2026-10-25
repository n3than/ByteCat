import type { Block } from "@bytecat/sb3";
import type { Gen, ReporterHandler, StatementHandler } from "../types.js";
import { POS_INT, STR_TEXT, ZERO } from "../analysis/typeset.js";
import { anyEx, asAny, asNum, boolEx, numEx, strEx, sumType } from "../cast.js";

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
  data_replaceitemoflist: (b, g) => [`replaceAt(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")}, ${item(b, g)});`],
  data_showvariable: () => [],
  data_hidevariable: () => [],
  data_showlist: () => [],
  data_hidelist: () => [],
};

export const dataReporters: Record<string, ReporterHandler> = {
  data_variable: (b, g) => anyEx(g.variable(b.fields.VARIABLE), g.varType(b.fields.VARIABLE)),
  data_listcontents: (b, g) => strEx(`listContents(${g.list(b.fields.LIST)})`),
  // An index out of range gives "".
  data_itemoflist: (b, g) => anyEx(`itemOf(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")})`, g.listType(b.fields.LIST) | STR_TEXT),
  data_lengthoflist: (b, g) => numEx(`${g.list(b.fields.LIST)}.length`, POS_INT | ZERO),
  data_listcontainsitem: (b, g) => boolEx(`listContains(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`),
  data_itemnumoflist: (b, g) => numEx(`indexOf(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`, POS_INT | ZERO),
};

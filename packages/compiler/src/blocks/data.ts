import type { ReporterHandler, StatementHandler } from "../types.js";
import { anyEx, boolEx, numEx, strEx } from "../cast.js";

export const dataStatements: Record<string, StatementHandler> = {
  data_setvariableto: (b, g) => [`${g.variable(b.fields.VARIABLE)} = ${g.any(b, "VALUE")};`],
  data_changevariableby: (b, g) => {
    const v = g.variable(b.fields.VARIABLE);
    return [`${v} = toNum(${v}) + ${g.num(b, "VALUE")};`];
  },
  data_addtolist: (b, g) => [`${g.list(b.fields.LIST)}.push(${g.any(b, "ITEM")});`],
  data_deleteoflist: (b, g) => [`deleteOf(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")});`],
  data_deletealloflist: (b, g) => [`${g.list(b.fields.LIST)}.length = 0;`],
  data_insertatlist: (b, g) => [`insertAt(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")}, ${g.any(b, "ITEM")});`],
  data_replaceitemoflist: (b, g) => [`replaceAt(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")}, ${g.any(b, "ITEM")});`],
  data_showvariable: () => [],
  data_hidevariable: () => [],
  data_showlist: () => [],
  data_hidelist: () => [],
};

export const dataReporters: Record<string, ReporterHandler> = {
  data_variable: (b, g) => anyEx(g.variable(b.fields.VARIABLE)),
  data_listcontents: (b, g) => strEx(`listContents(${g.list(b.fields.LIST)})`),
  data_itemoflist: (b, g) => anyEx(`itemOf(${g.list(b.fields.LIST)}, ${g.any(b, "INDEX")})`),
  data_lengthoflist: (b, g) => numEx(`${g.list(b.fields.LIST)}.length`),
  data_listcontainsitem: (b, g) => boolEx(`listContains(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`),
  data_itemnumoflist: (b, g) => numEx(`indexOf(${g.list(b.fields.LIST)}, ${g.any(b, "ITEM")})`),
};

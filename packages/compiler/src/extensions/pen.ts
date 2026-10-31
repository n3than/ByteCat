import { asName } from "../cast.js";
import { menu, missing, statement, type Extension } from "./api.js";

const LEGACY = "Scratch 2 pen block, still in old projects; not written yet";

/**
 * The Pen extension. Not a core category: a project lists `pen` under `extensions`. The pen state
 * lives on each target and the drawing on the renderer's pen layer (`@bytecat/runtime/pen`).
 */
export const pen: Extension = {
  id: "pen",
  name: "Pen",
  runtime: "@bytecat/runtime/pen",
  blocks: {
    pen_clear: statement(() => ["penClear(rt);"], { uses: ["penClear"] }),
    pen_stamp: statement(() => ["stamp(rt, t);"], { uses: ["stamp"] }),
    pen_penDown: statement(() => ["penDown(rt, t);"], { uses: ["penDown"] }),
    pen_penUp: statement(() => ["penUp(t);"], { uses: ["penUp"] }),
    pen_setPenColorToColor: statement((b, g) => [`setPenColor(t, ${g.any(b, "COLOR")});`], { uses: ["setPenColor"] }),
    pen_changePenColorParamBy: statement(
      (b, g) => [`setPenParam(t, ${asName(g.menu(b, "COLOR_PARAM"))}, ${g.num(b, "VALUE")}, true);`],
      { uses: ["setPenParam"] },
    ),
    pen_setPenColorParamTo: statement(
      (b, g) => [`setPenParam(t, ${asName(g.menu(b, "COLOR_PARAM"))}, ${g.num(b, "VALUE")}, false);`],
      { uses: ["setPenParam"] },
    ),
    pen_changePenSizeBy: statement((b, g) => [`setPenSize(t, penOf(t).size + ${g.num(b, "SIZE")});`], { uses: ["setPenSize", "penOf"] }),
    pen_setPenSizeTo: statement((b, g) => [`setPenSize(t, ${g.num(b, "SIZE")});`], { uses: ["setPenSize"] }),
    pen_setPenShadeToNumber: missing("statement", LEGACY, { hidden: true }),
    pen_changePenShadeBy: missing("statement", LEGACY, { hidden: true }),
    pen_setPenHueToNumber: missing("statement", LEGACY, { hidden: true }),
    pen_changePenHueBy: missing("statement", LEGACY, { hidden: true }),
    pen_menu_colorParam: menu("colorParam"),
  },
};

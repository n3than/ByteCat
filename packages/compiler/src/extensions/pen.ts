import { menu, missing, type Extension } from "./api.js";

const PEN = "no pen layer yet (Phase 7)";
const LEGACY = `Scratch 2 pen block, still in old projects; ${PEN}`;

/** The Pen extension. Not a core category: a project lists `pen` under `extensions`. */
export const pen: Extension = {
  id: "pen",
  name: "Pen",
  blocks: {
    pen_clear: missing("statement", PEN),
    pen_stamp: missing("statement", PEN),
    pen_penDown: missing("statement", PEN),
    pen_penUp: missing("statement", PEN),
    pen_setPenColorToColor: missing("statement", PEN),
    pen_changePenColorParamBy: missing("statement", PEN),
    pen_setPenColorParamTo: missing("statement", PEN),
    pen_changePenSizeBy: missing("statement", PEN),
    pen_setPenSizeTo: missing("statement", PEN),
    pen_setPenShadeToNumber: missing("statement", LEGACY, { hidden: true }),
    pen_changePenShadeBy: missing("statement", LEGACY, { hidden: true }),
    pen_setPenHueToNumber: missing("statement", LEGACY, { hidden: true }),
    pen_changePenHueBy: missing("statement", LEGACY, { hidden: true }),
    pen_menu_colorParam: menu("colorParam"),
  },
};

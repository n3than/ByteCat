import { numEx } from "../cast.js";
import { menu, missing, reporter, statement, type Extension } from "./api.js";

const LEGACY = "Scratch 2 leftover; a no-op in TurboWarp";

export const motion: Extension = {
  id: "motion",
  name: "Motion",
  blocks: {
    motion_movesteps: statement((b, g) => [`rt.move(t, ${g.num(b, "STEPS")});`], { uses: ["move"] }),
    motion_turnright: statement((b, g) => [`rt.setDirection(t, t.direction + ${g.num(b, "DEGREES")});`], { uses: ["setDirection"] }),
    motion_turnleft: statement((b, g) => [`rt.setDirection(t, t.direction - ${g.num(b, "DEGREES")});`], { uses: ["setDirection"] }),
    motion_goto: missing("statement", "go to random position, mouse pointer or a sprite; needs the shared menu resolver"),
    motion_gotoxy: statement((b, g) => [`rt.setXY(t, ${g.num(b, "X")}, ${g.num(b, "Y")});`], {
      uses: ["setXY"],
      note: "no motion block keeps the sprite on the stage yet (fencing, Phase 2); headless TurboWarp does not either",
    }),
    motion_glideto: missing("statement", "glide to random position, mouse pointer or a sprite"),
    motion_glidesecstoxy: statement(
      (b, g) => g.y(`yield* rt.glide(t, ${g.num(b, "SECS")}, ${g.num(b, "X")}, ${g.num(b, "Y")});`),
      { yields: "wait", uses: ["glide"] },
    ),
    motion_pointindirection: statement((b, g) => [`rt.setDirection(t, ${g.num(b, "DIRECTION")});`], { uses: ["setDirection"] }),
    motion_pointtowards: missing("statement", "point towards mouse pointer or a sprite"),
    motion_changexby: statement((b, g) => [`rt.setXY(t, t.x + ${g.num(b, "DX")}, t.y);`], { uses: ["setXY"] }),
    motion_setx: statement((b, g) => [`rt.setXY(t, ${g.num(b, "X")}, t.y);`], { uses: ["setXY"] }),
    motion_changeyby: statement((b, g) => [`rt.setXY(t, t.x, t.y + ${g.num(b, "DY")});`], { uses: ["setXY"] }),
    motion_sety: statement((b, g) => [`rt.setXY(t, t.x, ${g.num(b, "Y")});`], { uses: ["setXY"] }),
    motion_ifonedgebounce: statement(() => ["rt.bounce(t);"], {
      uses: ["bounce"],
      partial: "treats the sprite as a point; TurboWarp uses the costume's bounds",
    }),
    motion_setrotationstyle: statement((b, g) => [`t.rotationStyle = ${JSON.stringify(g.field(b, "STYLE"))};`]),
    motion_xposition: reporter(() => numEx("rt.coord(t.x)"), { uses: ["coord"] }),
    motion_yposition: reporter(() => numEx("rt.coord(t.y)"), { uses: ["coord"] }),
    motion_direction: reporter(() => numEx("t.direction")),
    motion_goto_menu: menu("TO"),
    motion_glideto_menu: menu("TO"),
    motion_pointtowards_menu: menu("TOWARDS"),
    motion_scroll_right: missing("statement", LEGACY, { hidden: true }),
    motion_scroll_up: missing("statement", LEGACY, { hidden: true }),
    motion_align_scene: missing("statement", LEGACY, { hidden: true }),
    motion_xscroll: missing("reporter", LEGACY, { hidden: true }),
    motion_yscroll: missing("reporter", LEGACY, { hidden: true }),
  },
};

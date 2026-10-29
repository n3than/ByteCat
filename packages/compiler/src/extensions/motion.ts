import { numEx } from "../cast.js";
import { menu, missing, reporter, statement, type Extension } from "./api.js";

const LEGACY = "Scratch 2 leftover; a no-op in TurboWarp";
/**
 * Every block that moves the sprite through `setXY`. TurboWarp keeps the sprite on the stage
 * (`keepInFence`, from the costume's bounds); Bytecat does not yet. Phase 2 adds fencing and drops
 * this note from all of them at once.
 */
const FENCING = "does not keep the sprite on the stage (fencing, Phase 2); headless TurboWarp, without a renderer, does not either";

export const motion: Extension = {
  id: "motion",
  name: "Motion",
  runtime: "@bytecat/runtime/motion",
  blocks: {
    motion_movesteps: statement((b, g) => [`move(rt, t, ${g.num(b, "STEPS")});`], { uses: ["move"], partial: FENCING }),
    motion_turnright: statement((b, g) => [`setDirection(rt, t, t.direction + ${g.num(b, "DEGREES")});`], { uses: ["setDirection"] }),
    motion_turnleft: statement((b, g) => [`setDirection(rt, t, t.direction - ${g.num(b, "DEGREES")});`], { uses: ["setDirection"] }),
    motion_goto: missing("statement", "go to random position, mouse pointer or a sprite; needs the shared menu resolver"),
    motion_gotoxy: statement((b, g) => [`setXY(rt, t, ${g.num(b, "X")}, ${g.num(b, "Y")});`], {
      uses: ["setXY"],
      partial: FENCING,
    }),
    motion_glideto: missing("statement", "glide to random position, mouse pointer or a sprite"),
    motion_glidesecstoxy: statement(
      (b, g) => g.y(`yield* glide(rt, t, ${g.num(b, "SECS")}, ${g.num(b, "X")}, ${g.num(b, "Y")});`),
      { yields: "wait", uses: ["glide"], partial: FENCING },
    ),
    motion_pointindirection: statement((b, g) => [`setDirection(rt, t, ${g.num(b, "DIRECTION")});`], { uses: ["setDirection"] }),
    motion_pointtowards: missing("statement", "point towards mouse pointer or a sprite"),
    motion_changexby: statement((b, g) => [`setXY(rt, t, t.x + ${g.num(b, "DX")}, t.y);`], { uses: ["setXY"], partial: FENCING }),
    motion_setx: statement((b, g) => [`setXY(rt, t, ${g.num(b, "X")}, t.y);`], { uses: ["setXY"], partial: FENCING }),
    motion_changeyby: statement((b, g) => [`setXY(rt, t, t.x, t.y + ${g.num(b, "DY")});`], { uses: ["setXY"], partial: FENCING }),
    motion_sety: statement((b, g) => [`setXY(rt, t, t.x, ${g.num(b, "Y")});`], { uses: ["setXY"], partial: FENCING }),
    motion_ifonedgebounce: statement(() => ["bounce(rt, t);"], {
      uses: ["bounce"],
      partial: "treats the sprite as a point; TurboWarp uses the costume's bounds",
    }),
    motion_setrotationstyle: statement((b, g) => [`t.rotationStyle = ${JSON.stringify(g.field(b, "STYLE"))};`]),
    motion_xposition: reporter(() => numEx("coord(t.x)"), { uses: ["coord"] }),
    motion_yposition: reporter(() => numEx("coord(t.y)"), { uses: ["coord"] }),
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

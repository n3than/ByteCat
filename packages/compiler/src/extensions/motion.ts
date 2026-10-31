import { asAny, numEx } from "../cast.js";
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
    // A menu fixed at compile time becomes the operation itself; any other value goes to a resolver
    // that looks at it when the block runs. A name that is no sprite does nothing, as in TurboWarp.
    motion_goto: statement(
      (b, g) => {
        const to = g.menu(b, "TO");
        if (to.special === "_mouse_") return ["setXY(rt, t, rt.mouse.x, rt.mouse.y);"];
        if (to.special === "_random_") return ["goToRandom(rt, t);"];
        return [`goTo(rt, t, ${asAny(to)});`];
      },
      { uses: ["setXY", "goToRandom", "goTo"], partial: FENCING },
    ),
    motion_gotoxy: statement((b, g) => [`setXY(rt, t, ${g.num(b, "X")}, ${g.num(b, "Y")});`], {
      uses: ["setXY"],
      partial: FENCING,
    }),
    motion_glideto: statement(
      (b, g) => {
        const secs = g.num(b, "SECS");
        const to = g.menu(b, "TO");
        if (to.special === "_mouse_") return g.y(`yield* glide(rt, t, ${secs}, rt.mouse.x, rt.mouse.y);`);
        if (to.special === "_random_") return g.y(`yield* glideToRandom(rt, t, ${secs});`);
        return g.y(`yield* glideTo(rt, t, ${secs}, ${asAny(to)});`);
      },
      {
        yields: "wait",
        uses: ["glide", "glideToRandom", "glideTo"],
        partial: `${FENCING}; a glide to a random position draws its position once, while TurboWarp draws again on every frame (unused), so later \`pick random\` results under a seeded generator differ`,
      },
    ),
    motion_glidesecstoxy: statement(
      (b, g) => g.y(`yield* glide(rt, t, ${g.num(b, "SECS")}, ${g.num(b, "X")}, ${g.num(b, "Y")});`),
      { yields: "wait", uses: ["glide"], partial: FENCING },
    ),
    motion_pointindirection: statement((b, g) => [`setDirection(rt, t, ${g.num(b, "DIRECTION")});`], { uses: ["setDirection"] }),
    motion_pointtowards: statement(
      (b, g) => {
        const to = g.menu(b, "TOWARDS");
        if (to.special === "_mouse_") return ["pointAt(rt, t, rt.mouse.x, rt.mouse.y);"];
        return [`pointTowards(rt, t, ${asAny(to)});`];
      },
      { uses: ["pointAt", "pointTowards"] },
    ),
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

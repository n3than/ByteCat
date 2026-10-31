import type { Block } from "@bytecat/sb3";
import { NUM } from "../analysis/typeset.js";
import { anyEx, boolEx, lit, numEx, strEx } from "../cast.js";
import type { Ex, Gen } from "../types.js";
import { boolean, menu, missing, reporter, statement, type Extension } from "./api.js";

const GEOMETRY = "needs costume geometry";
const RENDERER = "needs the renderer";

export const sensing: Extension = {
  id: "sensing",
  name: "Sensing",
  runtime: "@bytecat/runtime/sensing",
  blocks: {
    sensing_touchingobject: missing("boolean", `mouse pointer, edge or a sprite; ${GEOMETRY}`),
    sensing_touchingcolor: missing("boolean", RENDERER),
    sensing_coloristouchingcolor: missing("boolean", RENDERER),
    sensing_distanceto: missing("reporter", "distance to the mouse pointer or a sprite"),
    sensing_askandwait: statement((b, g) => g.y(`yield* ask(rt, t, ${g.any(b, "QUESTION")});`), { yields: "wait", uses: ["ask"] }),
    sensing_answer: reporter(() => strEx("rt.answer")),
    sensing_keypressed: boolean((b, g) => boolEx(`keyPressed(rt, ${g.any(b, "KEY_OPTION")})`), { uses: ["keyPressed"] }),
    sensing_mousedown: boolean(() => boolEx("rt.mouse.down")),
    sensing_mousex: reporter(() => numEx("rt.mouse.x")),
    sensing_mousey: reporter(() => numEx("rt.mouse.y")),
    sensing_setdragmode: missing("statement", "and dragging sprites in the player"),
    sensing_loudness: missing("reporter", "no microphone; should report TurboWarp's value without one"),
    sensing_timer: reporter(() => numEx("timer(rt)"), { uses: ["timer"] }),
    sensing_resettimer: statement(() => ["resetTimer(rt);"], { uses: ["resetTimer"] }),
    sensing_of: reporter(attributeOf, { uses: ["attributeOf"], partial: "volume is always 100 (no sound yet)" }),
    sensing_current: missing("reporter", "year, month, date, weekday, hour, minute, second"),
    sensing_dayssince2000: reporter(() => numEx("daysSince2000()"), { uses: ["daysSince2000"] }),
    sensing_username: reporter(() => lit("")),
    sensing_touchingobjectmenu: menu("TOUCHINGOBJECTMENU"),
    sensing_distancetomenu: menu("DISTANCETOMENU"),
    sensing_keyoptions: menu("KEY_OPTION"),
    sensing_of_object_menu: menu("OBJECT"),
    sensing_loud: missing("boolean", "no microphone", { hidden: true }),
    sensing_userid: missing("reporter", "Scratch 2 leftover", { hidden: true }),
    sensing_online: missing("boolean", "TurboWarp-only; reports whether the browser is online", { hidden: true }),
  },
};

/** Volume, until sound is supported: every target's starts at 100. */
const VOLUME = "100";

/**
 * `[property] of [object]`, as TurboWarp's compiler does it: with the object fixed, a sprite's
 * x, y, direction, costume and size and the backdrop are read straight from the target, and any
 * other property is the variable of that name the object owns, or 0. A sprite that does not
 * exist reads 0. A computed object goes through `attributeOf` at run time.
 */
function attributeOf(b: Block, g: Gen): Ex {
  const property = g.field(b, "PROPERTY");
  const object = g.menu(b, "OBJECT");
  if (object.k === undefined) {
    // It may read a variable of this target or the stage with that name from its storage.
    for (const owner of [g.target, g.stage]) {
      const id = variableNamed(owner.variables, property);
      if (id !== undefined) g.unlocal([property, id]);
    }
    return anyEx(`attributeOf(rt, ${object.c}, ${JSON.stringify(property)})`);
  }
  if (property === "volume") return object.special === "_stage_" || g.sprite(object.k) ? lit(VOLUME) : lit("0");
  if (object.special === "_stage_") {
    if (property === "backdrop #" || property === "background #") return numEx("(S.costume + 1)", NUM);
    if (property === "backdrop name") return strEx("S.costumes[S.costume].name");
    const id = variableNamed(g.stage.variables, property);
    return id === undefined ? lit("0") : anyEx(g.variable([property, id]), g.varType([property, id]));
  }
  const sprite = g.sprite(object.k);
  if (!sprite) return lit("0");
  // The original: TurboWarp's getSpriteTargetByName finds it before any clone.
  const o = `rt.targets[${sprite.index}]`;
  switch (property) {
    case "x position": return numEx(`${o}.x`, NUM);
    case "y position": return numEx(`${o}.y`, NUM);
    case "direction": return numEx(`${o}.direction`, NUM);
    case "costume #": return numEx(`(${o}.costume + 1)`, NUM);
    case "costume name": return strEx(`${o}.costumes[${o}.costume].name`);
    case "size": return numEx(`${o}.size`, NUM);
  }
  const id = variableNamed(sprite.target.variables, property);
  if (id === undefined) return lit("0");
  const storage = `${o}.v[${JSON.stringify(id)}]`;
  // A sprite reading its own variable may hold it in a local, which is the truth while it runs;
  // a clone reads its original's.
  if (sprite.target === g.target) return anyEx(`(t.isOriginal ? ${g.variable([property, id])} : ${storage})`);
  return anyEx(storage);
}

/** The id of the first variable with this name, in project.json order (`lookupVariableByNameAndType`). */
function variableNamed(variables: Record<string, [string, unknown, ...unknown[]]>, name: string): string | undefined {
  for (const id in variables) if (variables[id]![0] === name) return id;
  return undefined;
}

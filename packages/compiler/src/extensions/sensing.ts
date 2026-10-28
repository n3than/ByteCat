import { boolEx, lit, numEx, strEx } from "../cast.js";
import { boolean, menu, missing, reporter, statement, type Extension } from "./api.js";

const GEOMETRY = "needs costume geometry";
const RENDERER = "needs the renderer";

export const sensing: Extension = {
  id: "sensing",
  name: "Sensing",
  blocks: {
    sensing_touchingobject: missing("boolean", `mouse pointer, edge or a sprite; ${GEOMETRY}`),
    sensing_touchingcolor: missing("boolean", RENDERER),
    sensing_coloristouchingcolor: missing("boolean", RENDERER),
    sensing_distanceto: missing("reporter", "distance to the mouse pointer or a sprite"),
    sensing_askandwait: statement((b, g) => g.y(`yield* rt.ask(t, ${g.any(b, "QUESTION")});`), { yields: "wait", uses: ["ask"] }),
    sensing_answer: reporter(() => strEx("rt.answer"), { uses: ["answer"] }),
    sensing_keypressed: boolean((b, g) => boolEx(`rt.keyPressed(${g.any(b, "KEY_OPTION")})`), { uses: ["keyPressed"] }),
    sensing_mousedown: boolean(() => boolEx("rt.mouse.down"), { uses: ["mouse"] }),
    sensing_mousex: reporter(() => numEx("rt.mouse.x"), { uses: ["mouse"] }),
    sensing_mousey: reporter(() => numEx("rt.mouse.y"), { uses: ["mouse"] }),
    sensing_setdragmode: missing("statement", "and dragging sprites in the player"),
    sensing_loudness: missing("reporter", "no microphone; should report TurboWarp's value without one"),
    sensing_timer: reporter(() => numEx("rt.timer()"), { uses: ["timer"] }),
    sensing_resettimer: statement(() => ["rt.resetTimer();"], { uses: ["resetTimer"] }),
    sensing_of: missing("reporter", "x, direction, costume, size, volume or a variable of another sprite or the stage"),
    sensing_current: missing("reporter", "year, month, date, weekday, hour, minute, second"),
    sensing_dayssince2000: reporter(() => numEx("rt.daysSince2000()"), { uses: ["daysSince2000"] }),
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

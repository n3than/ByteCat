import type { ReporterHandler, StatementHandler } from "../types.js";
import { boolEx, lit, numEx, strEx } from "../cast.js";

export const sensingStatements: Record<string, StatementHandler> = {
  sensing_askandwait: (b, g) => g.y(`yield* rt.ask(t, ${g.any(b, "QUESTION")});`),
  sensing_resettimer: () => ["rt.resetTimer();"],
};

export const sensingReporters: Record<string, ReporterHandler> = {
  sensing_timer: () => numEx("rt.timer()"),
  sensing_answer: () => strEx("rt.answer"),
  sensing_mousex: () => numEx("rt.mouse.x"),
  sensing_mousey: () => numEx("rt.mouse.y"),
  sensing_mousedown: () => boolEx("rt.mouse.down"),
  sensing_keypressed: (b, g) => boolEx(`rt.keyPressed(${g.any(b, "KEY_OPTION")})`),
  sensing_dayssince2000: () => numEx("rt.daysSince2000()"),
  sensing_username: () => lit(""),
};

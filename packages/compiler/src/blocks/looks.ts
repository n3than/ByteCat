import type { ReporterHandler, StatementHandler } from "../types.js";
import { asName, numEx, strEx } from "../cast.js";

export const looksStatements: Record<string, StatementHandler> = {
  looks_say: (b, g) => [`rt.say(t, "say", ${g.any(b, "MESSAGE")});`],
  looks_think: (b, g) => [`rt.say(t, "think", ${g.any(b, "MESSAGE")});`],
  looks_sayforsecs: (b, g) => g.y(`yield* rt.sayFor(t, "say", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
  looks_thinkforsecs: (b, g) => g.y(`yield* rt.sayFor(t, "think", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
  looks_switchcostumeto: (b, g) => [`rt.switchCostume(t, ${asName(g.input(b, "COSTUME"))});`],
  looks_nextcostume: () => ["rt.nextCostume(t);"],
  looks_switchbackdropto: (b, g) => [`rt.switchCostume(S, ${asName(g.input(b, "BACKDROP"))});`],
  looks_nextbackdrop: () => ["rt.nextCostume(S);"],
  looks_changesizeby: (b, g) => [`rt.setSize(t, t.size + ${g.num(b, "CHANGE")});`],
  looks_setsizeto: (b, g) => [`rt.setSize(t, ${g.num(b, "SIZE")});`],
  looks_show: () => ["rt.setVisible(t, true);"],
  looks_hide: () => ["rt.setVisible(t, false);"],
  looks_gotofrontback: (b, g) => (g.field(b, "FRONT_BACK") === "front" ? ["rt.goToFront(t);"] : undefined),
};

export const looksReporters: Record<string, ReporterHandler> = {
  looks_costumenumbername: (b, g) =>
    g.field(b, "NUMBER_NAME") === "name" ? strEx("rt.costumeName(t)") : numEx("(t.costume + 1)"),
  looks_backdropnumbername: (b, g) =>
    g.field(b, "NUMBER_NAME") === "name" ? strEx("rt.costumeName(S)") : numEx("(S.costume + 1)"),
  looks_size: () => numEx("Math.round(t.size)"),
};

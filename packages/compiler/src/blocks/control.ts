import { POS_INT } from "../analysis/typeset.js";
import { notCode } from "../cast.js";
import type { StatementHandler } from "../types.js";

export const controlStatements: Record<string, StatementHandler> = {
  control_wait: (b, g) => g.y(`yield* rt.wait(${g.num(b, "DURATION")});`),
  // The condition is checked again after each wait, when other scripts may have changed it.
  control_wait_until: (b, g) => {
    const lines = [g.store(), `while (${notCode(g.input(b, "CONDITION"))}) {`, "  yield rt.WAIT;", `  ${g.load()}`, "}"];
    g.markYields();
    return lines;
  },
  control_repeat: (b, g) => {
    const r = g.tmp();
    return [`for (let ${r} = Math.round(${g.num(b, "TIMES")}); ${r} > 0; ${r}--) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"];
  },
  control_forever: (b, g) => ["for (;;) {", ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"],
  control_repeat_until: (b, g) => [`while (${notCode(g.input(b, "CONDITION"))}) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"],
  control_while: (b, g) => [`while (${g.bool(b, "CONDITION")}) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"],
  control_for_each: (b, g) => {
    const r = g.tmp();
    const v = g.variable(b.fields.VARIABLE);
    g.noteWrite(b.fields.VARIABLE, POS_INT);
    return [
      `for (let ${r} = 1, n = ${g.num(b, "VALUE")}; ${r} <= n; ${r}++) {`,
      `  ${v} = ${r};`,
      ...g.substack(b, "SUBSTACK"),
      ...g.loopYield(),
      "}",
    ];
  },
  control_if: (b, g) => [`if (${g.bool(b, "CONDITION")}) {`, ...g.substack(b, "SUBSTACK"), "}"],
  control_if_else: (b, g) => [
    `if (${g.bool(b, "CONDITION")}) {`,
    ...g.substack(b, "SUBSTACK"),
    "} else {",
    ...g.substack(b, "SUBSTACK2"),
    "}",
  ],
  control_stop: (b, g) => {
    const option = g.field(b, "STOP_OPTION");
    if (option === "all") return [g.store(), "throw rt.STOP_ALL;"];
    // In Scratch 3, "stop this script" inside a custom block returns from that block only.
    if (option === "this script") return [g.store(), "return;"];
    return ["rt.stopOthers(t, th);"];
  },
};

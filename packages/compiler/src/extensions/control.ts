import { POS_INT, typeOfValue, ZERO } from "../analysis/typeset.js";
import { asAny, notCode, numEx, unindent } from "../cast.js";
import { hat, menu, reporter, statement, type Extension } from "./api.js";

const SUBSTACK = ["SUBSTACK"];

export const control: Extension = {
  id: "control",
  name: "Control",
  runtime: "@bytecat/runtime/control",
  blocks: {
    control_wait: statement((b, g) => g.y(`yield* wait(rt, ${g.num(b, "DURATION")});`), { yields: "wait", uses: ["wait"] }),
    control_repeat: statement(
      (b, g) => {
        const r = g.tmp();
        return [`for (let ${r} = Math.round(${g.num(b, "TIMES")}); ${r} > 0; ${r}--) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"];
      },
      { yields: "loop", substacks: SUBSTACK },
    ),
    control_forever: statement((b, g) => ["for (;;) {", ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"], {
      yields: "loop",
      substacks: SUBSTACK,
    }),
    control_if: statement((b, g) => [`if (${g.bool(b, "CONDITION")}) {`, ...g.substack(b, "SUBSTACK"), "}"], { substacks: SUBSTACK }),
    control_if_else: statement(
      (b, g) => [`if (${g.bool(b, "CONDITION")}) {`, ...g.substack(b, "SUBSTACK"), "} else {", ...g.substack(b, "SUBSTACK2"), "}"],
      { substacks: ["SUBSTACK", "SUBSTACK2"] },
    ),
    // The condition is checked again after each wait, when other scripts may have changed it.
    control_wait_until: statement(
      (b, g) => {
        const lines = [g.store(), `while (${notCode(g.input(b, "CONDITION"))}) {`, "  yield WAIT;", `  ${g.load()}`, "}"];
        g.markYields();
        return lines;
      },
      { yields: "wait", uses: ["WAIT"] },
    ),
    control_repeat_until: statement(
      (b, g) => [`while (${notCode(g.input(b, "CONDITION"))}) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"],
      { yields: "loop", substacks: SUBSTACK },
    ),
    control_stop: statement(
      (b, g) => {
        const option = g.field(b, "STOP_OPTION");
        if (option === "all") return [g.store(), "throw STOP_ALL;"];
        // In Scratch 3, "stop this script" inside a custom block returns from that block only.
        // A custom reporter called this way reports "" (TurboWarp's `stopScript`).
        if (option === "this script") {
          if (!g.procedure?.reporter) return [g.store(), "return;"];
          g.noteReturn(typeOfValue(""));
          return [g.store(), 'return "";'];
        }
        return ["stopOthers(rt, t, th);"];
      },
      { uses: ["STOP_ALL", "stopOthers"] },
    ),
    // The runtime starts it for the new clone only (`createClone`).
    control_start_as_clone: hat("clone", { restartExistingThreads: false }),
    // The clone copies the target's variables, so the ones kept in locals are stored first.
    control_create_clone_of: statement(
      (b, g) => {
        const option = g.menu(b, "CLONE_OPTION");
        if (option.special === "_myself_") return [g.store(), "createClone(rt, t);"];
        return [g.store(), `createCloneOf(rt, t, ${asAny(option)});`];
      },
      { uses: ["createClone", "createCloneOf"] },
    ),
    // Nothing for a sprite. A clone is removed with its scripts, and this one ends: a hat script
    // returns, and a custom block throws RETIRE past its callers, as TurboWarp's `retire` does.
    // The locals are stored first, since the script never stores them again.
    control_delete_this_clone: statement((_, g) => [g.store(), `if (deleteClone(rt, t)) ${g.procedure ? "throw RETIRE" : "return"};`], {
      uses: ["deleteClone", "RETIRE"],
    }),
    control_create_clone_of_menu: menu("CLONE_OPTION"),
    control_while: statement(
      (b, g) => [`while (${g.bool(b, "CONDITION")}) {`, ...g.substack(b, "SUBSTACK"), ...g.loopYield(), "}"],
      { yields: "loop", substacks: SUBSTACK, hidden: true },
    ),
    control_for_each: statement(
      (b, g) => {
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
      { yields: "loop", substacks: SUBSTACK, hidden: true },
    ),
    // The counter is one number on the runtime, shared by every target. TurboWarp keeps it in
    // `runtime.ext_scratch3_control._counter`, types the reporter as a non-negative integer, and
    // clears it only when the runtime is disposed, not on the green flag.
    control_get_counter: reporter(() => numEx("rt.counter", POS_INT | ZERO), { hidden: true }),
    control_incr_counter: statement(() => ["rt.counter++;"], { hidden: true }),
    control_clear_counter: statement(() => ["rt.counter = 0;"], { hidden: true }),
    // TurboWarp compiles this Scratch 2 block as `if (true) { substack }`: plain code in the
    // script's own warp mode, so the substack is emitted in place.
    control_all_at_once: statement((b, g) => unindent(g.substack(b, "SUBSTACK")), { substacks: SUBSTACK, hidden: true }),
  },
};

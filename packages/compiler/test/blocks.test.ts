import { describe, expect, it } from "vitest";
import { reporters, statements } from "../src/blocks/index.js";
import * as control from "../src/blocks/control.js";
import * as data from "../src/blocks/data.js";
import * as events from "../src/blocks/events.js";
import * as looks from "../src/blocks/looks.js";
import * as motion from "../src/blocks/motion.js";
import * as operators from "../src/blocks/operators.js";
import * as procedures from "../src/blocks/procedures.js";
import * as sensing from "../src/blocks/sensing.js";
import { comparison } from "../src/blocks/operators.js";
import type { Ex } from "../src/types.js";
import { anyEx, lit, numEx, strEx } from "../src/cast.js";
import { block, stubGen } from "./helpers.js";

describe("block handler tables", () => {
  it("have no opcode in both tables", () => {
    for (const op of Object.keys(statements)) expect(reporters, op).not.toHaveProperty(op);
  });

  it("only handle real Scratch opcodes", () => {
    for (const op of [...Object.keys(statements), ...Object.keys(reporters)]) {
      expect(op).toMatch(/^(motion|looks|event|control|sensing|operator|data|procedures|argument)_[a-z0-9_]+$/);
    }
  });
});

describe("statement handlers", () => {
  it("motion casts inputs to numbers", () => {
    const g = stubGen({ X: lit("5"), Y: anyEx("v") });
    expect(statements.motion_gotoxy!(block("motion_gotoxy"), g)).toEqual(["rt.setXY(t, 5, toNum(v));"]);
  });

  it("waiting blocks mark the code as yielding", () => {
    const g = stubGen({ DURATION: lit("1") });
    expect(statements.control_wait!(block("control_wait"), g)).toEqual(["yield* rt.wait(1);"]);
    expect(g.yielded).toBe(true);
  });

  it("instant blocks do not", () => {
    const g = stubGen({ MESSAGE: lit("hi") });
    expect(statements.looks_say!(block("looks_say"), g)).toEqual(['rt.say(t, "say", "hi");']);
    expect(g.yielded).toBe(false);
  });

  it("loops end each iteration with the loop yield", () => {
    const g = stubGen({ TIMES: numEx("n") });
    expect(statements.control_repeat!(block("control_repeat"), g)).toEqual([
      "for (let r0 = Math.round(n); r0 > 0; r0--) {",
      "  body;",
      "  if (th.warp === 0) yield;",
      "}",
    ]);
  });

  it("go to back is unsupported, front is not", () => {
    expect(statements.looks_gotofrontback!(block("looks_gotofrontback"), stubGen({}, { FRONT_BACK: "front" }))).toEqual(["rt.goToFront(t);"]);
    expect(statements.looks_gotofrontback!(block("looks_gotofrontback"), stubGen({}, { FRONT_BACK: "back" }))).toBeUndefined();
  });

  it("stop options", () => {
    const stop = (option: string) => statements.control_stop!(block("control_stop"), stubGen({}, { STOP_OPTION: option }));
    expect(stop("all")).toEqual(["throw rt.STOP_ALL;"]);
    expect(stop("this script")).toEqual(["return;"]);
    expect(stop("other scripts in sprite")).toEqual(["rt.stopOthers(t, th);"]);
  });
});

describe("reporter handlers", () => {
  it("arithmetic is typed as a number", () => {
    const g = stubGen({ NUM1: numEx("a"), NUM2: lit("2") });
    expect(reporters.operator_add!(block("operator_add"), g)).toEqual({ c: "(a + 2)", t: "num" });
  });

  it("join casts both sides to text", () => {
    const g = stubGen({ STRING1: lit("a"), STRING2: numEx("n") });
    expect(reporters.operator_join!(block("operator_join"), g)).toEqual({ c: '("a" + ("" + n))', t: "str" });
  });
});

describe("comparison", () => {
  const b = block("operator_equals");
  const cmp = (a: Record<string, Ex>) => comparison(b, stubGen(a), "===", "eq").c;

  it("uses plain operators for two numbers", () => {
    expect(cmp({ OPERAND1: numEx("a"), OPERAND2: lit("3") })).toBe("(a === 3)");
  });

  it("lowercases when a side is a text literal", () => {
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("Hi") })).toBe('(toStr(v).toLowerCase() === "hi")');
  });

  it("passes numeric literals to the helper as numbers", () => {
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("3") })).toBe("eq(v, 3)");
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("3.0") })).toBe('eq(v, "3.0")');
  });
});

describe("category files", () => {
  it("define disjoint opcodes, so merging them never shadows a handler", () => {
    const tables = [
      motion.motionStatements, motion.motionReporters, looks.looksStatements, looks.looksReporters,
      events.eventStatements, control.controlStatements, sensing.sensingStatements, sensing.sensingReporters,
      data.dataStatements, data.dataReporters, operators.operatorReporters,
      procedures.procedureStatements, procedures.procedureReporters,
    ];
    const seen = new Set<string>();
    for (const table of tables) {
      for (const op of Object.keys(table)) {
        expect(seen.has(op), `${op} defined twice`).toBe(false);
        seen.add(op);
      }
    }
    expect(seen.size).toBe(Object.keys(statements).length + Object.keys(reporters).length);
  });
});

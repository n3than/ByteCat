import { ops, type Value } from "@bytecat/runtime";
import { describe, expect, it } from "vitest";
import { builtins } from "../src/extensions/index.js";
import { comparison } from "../src/extensions/operator.js";
import type { Ex } from "../src/types.js";
import {
  ANY, NAN, NEG_FRACT, NEG_INT, NEG_ZERO, NUM, NUM_OR_NAN, POS_FRACT, POS_INF, POS_INT, STR, STR_NUM, STR_TEXT, ZERO, mod as modType,
  typeOfValue,
} from "../src/analysis/typeset.js";
import { anyEx, boolEx, lit, numEx, strEx } from "../src/cast.js";
import { block, stubGen } from "./helpers.js";

const { statements, reporters } = builtins;

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
    expect(statements.motion_gotoxy!(block("motion_gotoxy"), g)).toEqual(["setXY(rt, t, 5, toNum(v));"]);
  });

  it("waiting blocks mark the code as yielding", () => {
    const g = stubGen({ DURATION: lit("1") });
    expect(statements.control_wait!(block("control_wait"), g)).toEqual(["yield* wait(rt, 1);"]);
    expect(g.yielded).toBe(true);
  });

  it("instant blocks do not", () => {
    const g = stubGen({ MESSAGE: lit("hi") });
    expect(statements.looks_say!(block("looks_say"), g)).toEqual(['say(rt, t, "say", "hi");']);
    expect(g.yielded).toBe(false);
  });

  it("loops end each iteration with the loop yield", () => {
    const g = stubGen({ TIMES: numEx("n", NUM) });
    expect(statements.control_repeat!(block("control_repeat"), g)).toEqual([
      "for (let r0 = Math.round(n); r0 > 0; r0--) {",
      "  body;",
      "  if (th.warp === 0) yield;",
      "}",
    ]);
  });

  it("go to back is unsupported, front is not", () => {
    expect(statements.looks_gotofrontback!(block("looks_gotofrontback"), stubGen({}, { FRONT_BACK: "front" }))).toEqual(["goToFront(rt, t);"]);
    expect(statements.looks_gotofrontback!(block("looks_gotofrontback"), stubGen({}, { FRONT_BACK: "back" }))).toBeUndefined();
  });

  it("stop options", () => {
    const stop = (option: string) => statements.control_stop!(block("control_stop"), stubGen({}, { STOP_OPTION: option }));
    // Leaving the script stores the variables it keeps in locals first.
    expect(stop("all")).toEqual(["store;", "throw STOP_ALL;"]);
    expect(stop("this script")).toEqual(["store;", "return;"]);
    expect(stop("other scripts in sprite")).toEqual(["stopOthers(rt, t, th);"]);
  });

  it("create clone stores the locals, which the clone copies, and clones itself without a lookup", () => {
    const create = (option: Ex) => statements.control_create_clone_of!(block("control_create_clone_of"), stubGen({ CLONE_OPTION: option }));
    expect(create(lit("_myself_"))).toEqual(["store;", "createClone(rt, t);"]);
    expect(create(lit("Dog"))).toEqual(["store;", 'createCloneOf(rt, t, "Dog");']);
    expect(create(anyEx("v"))).toEqual(["store;", "createCloneOf(rt, t, v);"]);
  });

  it("delete this clone returns from a script and throws RETIRE from a custom block", () => {
    const del = (g: ReturnType<typeof stubGen>) => statements.control_delete_this_clone!(block("control_delete_this_clone"), g);
    const g = stubGen();
    expect(del(g)).toEqual(["store;", "if (deleteClone(rt, t)) return;"]);
    expect(g.yielded).toBe(false);
    const inProc = Object.assign(stubGen(), { procedure: { fn: "p0", params: [], warp: true, sync: true } });
    expect(del(inProc)).toEqual(["store;", "if (deleteClone(rt, t)) throw RETIRE;"]);
  });

  it("the counter blocks are plain operations on the runtime's counter", () => {
    expect(statements.control_incr_counter!(block("control_incr_counter"), stubGen())).toEqual(["rt.counter++;"]);
    expect(statements.control_clear_counter!(block("control_clear_counter"), stubGen())).toEqual(["rt.counter = 0;"]);
  });

  it("all at once puts its body in place, without a loop or a yield of its own", () => {
    const g = stubGen();
    expect(statements.control_all_at_once!(block("control_all_at_once"), g)).toEqual(["body;"]);
    expect(g.yielded).toBe(false);
  });
});

describe("reporter handlers", () => {
  it("counter reads the runtime's counter, typed like TurboWarp's non-negative integer", () => {
    const counter = reporters.control_get_counter!(block("control_get_counter"), stubGen())!;
    expect(counter.c).toBe("rt.counter");
    expect(counter.t).toBe(POS_INT | ZERO);
  });

  it("arithmetic is typed from its operands", () => {
    const g = stubGen({ NUM1: anyEx("a", POS_INT), NUM2: lit("2") });
    const sum = reporters.operator_add!(block("operator_add"), g)!;
    expect(sum.c).toBe("(a + 2)");
    // Two positive integers add up to a positive integer, or overflow to Infinity; never NaN.
    expect(sum.t & ~NUM).toBe(0);
    // An untyped operand is cast first.
    expect(reporters.operator_add!(block("operator_add"), stubGen({ NUM1: anyEx("a"), NUM2: lit("2") }))!.c).toBe("(toNum(a) + 2)");
  });

  it("join casts both sides to text", () => {
    const g = stubGen({ STRING1: lit("a"), STRING2: numEx("n") });
    expect(reporters.operator_join!(block("operator_join"), g)).toEqual({ c: '("a" + ("" + n))', t: STR });
  });
});

describe("comparison", () => {
  const b = block("operator_equals");
  const cmp = (a: Record<string, Ex>) => comparison(b, stubGen(a), "===", "eq").c;

  it("uses plain operators for two numbers", () => {
    expect(cmp({ OPERAND1: numEx("a", NUM), OPERAND2: lit("3") })).toBe("(a === 3)");
  });

  it("keeps Scratch's rules for a number that may be NaN, which compares as text", () => {
    expect(comparison(b, stubGen({ OPERAND1: numEx("a"), OPERAND2: lit("3") }), "<", "lt").c).toBe("lt(a, 3)");
    // NaN never equals a number, so equality with a number that cannot be NaN stays plain.
    expect(cmp({ OPERAND1: numEx("a"), OPERAND2: lit("3") })).toBe("(a === 3)");
    expect(cmp({ OPERAND1: numEx("a"), OPERAND2: numEx("b") })).toBe("eq(a, b)");
  });

  it("lowercases when a side is a text literal", () => {
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("Hi") })).toBe('(toStr(v).toLowerCase() === "hi")');
  });

  it("passes numeric literals to the helper as numbers", () => {
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("3") })).toBe("eq(v, 3)");
    expect(cmp({ OPERAND1: anyEx("v"), OPERAND2: lit("3.0") })).toBe('eq(v, "3.0")');
  });
});

describe("comparison matches the runtime helpers", () => {
  // Every pair of these values, each typed exactly as its kind, must compare as eq / lt / gt do.
  const values: Value[] = [
    0, -0, 1, -1, 2.5, 1e21, Infinity, -Infinity, NaN, "", " ", "abc", "1", "1.0", " 1 ", "-0", "1e3",
    "Infinity", "infinity", "-infinity", "INFINITY", "NaN", "nan", "true", "1e+21", true, false,
  ];
  const run = (code: string, x: Value, y: Value) =>
    new Function("ops", "x", "y", `const { toNum, toStr, eq, lt, gt } = ops; return ${code};`)(ops, x, y) as boolean;
  const show = (v: Value) => (typeof v === "string" ? JSON.stringify(v) : Object.is(v, -0) ? "-0" : String(v));

  for (const [jsOp, helper] of [["===", "eq"], ["<", "lt"], [">", "gt"]] as const) {
    it(helper, () => {
      const misses: string[] = [];
      for (const x of values) {
        for (const y of values) {
          const code = comparison(b(), stubGen({ OPERAND1: anyEx("x", typeOfValue(x)), OPERAND2: anyEx("y", typeOfValue(y)) }), jsOp, helper).c;
          const want = ops[helper](x, y);
          if (run(code, x, y) !== want) misses.push(`${show(x)} ${jsOp} ${show(y)}: ${code} gives ${!want}`);
        }
      }
      expect(misses).toEqual([]);
    });
  }
  const b = () => block("operator_equals");
});

describe("typed operator fast paths", () => {
  const POS = POS_INT | POS_FRACT;
  const r = (op: string, inputs: Record<string, Ex>, fields: Record<string, [string, string]> = {}) =>
    reporters[op]!(block(op, { fields: fields as never }), stubGen(inputs))!;
  const list = { LIST: ["L", "l1"] as [string, string] };

  describe("mod", () => {
    const mod = (a: Ex, m: Ex) => r("operator_mod", { NUM1: a, NUM2: m }).c;
    it("is a plain % for a non-negative dividend and a positive divisor", () => {
      expect(mod(numEx("n", POS_INT | ZERO), lit("3"))).toBe("(n % 3)");
      expect(mod(numEx("n", POS), numEx("m", POS))).toBe("(n % m)");
      expect(mod(lit("0"), lit("0.5"))).toBe("(0 % 0.5)");
      expect(mod(lit("7.5"), lit("2"))).toBe("(7.5 % 2)");
    });
    it("keeps the helper for -0, negative, NaN or infinite dividends", () => {
      for (const t of [NEG_ZERO, NEG_INT, NEG_FRACT, POS_INF, NUM, POS_INT | NEG_INT]) {
        expect(mod(numEx("n", t), lit("3")), String(t)).toMatch(/^mod\(/);
      }
      // NaN is cast to 0 first, and 0 % 3 needs no correction.
      expect(mod(numEx("n", NAN), lit("3"))).toBe("(toNum(n) % 3)");
      expect(mod(lit("-1"), lit("3"))).toBe("mod((-1), 3)");
      expect(mod(lit("-0"), lit("3"))).toBe("mod(-0, 3)");
      expect(mod(anyEx("v"), lit("3"))).toBe("mod(toNum(v), 3)");
    });
    it("keeps the helper for a zero, negative, infinite or unknown divisor", () => {
      for (const lt of ["0", "-3", "Infinity", "-0", "abc", ""]) {
        expect(mod(numEx("n", POS_INT), lit(lt)), lt).toMatch(/^mod\(/);
      }
      for (const t of [POS_INT | ZERO, POS_INT | POS_INF, POS_INT | NEG_INT, NUM_OR_NAN]) {
        expect(mod(numEx("n", POS_INT), numEx("m", t)), String(t)).toMatch(/^mod\(/);
      }
    });
    it("keeps the result type", () => {
      expect(r("operator_mod", { NUM1: numEx("n", POS_INT), NUM2: lit("3") }).t).toBe(modType(POS_INT, POS_INT));
    });
  });

  describe("letter of", () => {
    const letter = (i: Ex, s: Ex) => r("operator_letter_of", { LETTER: i, STRING: s }).c;
    it("is charAt for an index of at least 1, not cut to 32 bits", () => {
      expect(letter(lit("4294967299"), lit("0.5"))).toBe('"0.5".charAt(4294967298)');
      expect(letter(numEx("i", POS_INT), strEx("s"))).toBe("s.charAt(i - 1)");
      expect(letter(lit("1"), lit("abc"))).toBe('"abc".charAt(0)');
      expect(letter(lit("3"), anyEx("v"))).toBe("toStr(v).charAt(2)");
      expect(letter(numEx("i", POS_INT), numEx("n", POS_INT))).toBe('("" + n).charAt(i - 1)');
    });
    it("keeps the helper when the index may be below 1 or not an integer", () => {
      for (const t of [POS_INT | NEG_ZERO, POS_INT | POS_FRACT, NUM, NUM_OR_NAN, STR_NUM, ANY]) {
        expect(letter(numEx("i", t), strEx("s")), String(t)).toMatch(/^letterOf\(/);
      }
      expect(letter(lit("1.0"), strEx("s"))).toBe('letterOf("1.0", s)');
      expect(letter(lit("1", true), strEx("s"))).toBe('letterOf("1", s)');
      expect(letter(lit("-1"), strEx("s"))).toBe("letterOf((-1), s)");
    });
    it("keeps the order of two random draws", () => {
      const rnd = numEx("random(1, 3)", POS_INT);
      expect(letter(rnd, strEx("(a + toStr(random(1, 9)))"))).toBe("letterOf(random(1, 3), (a + toStr(random(1, 9))))");
      expect(letter(rnd, strEx("s"))).toBe("s.charAt(random(1, 3) - 1)");
      expect(letter(numEx("i", POS_INT), strEx("toStr(random(1, 9))"))).toBe("toStr(random(1, 9)).charAt(i - 1)");
    });
  });

  describe("item of", () => {
    const item = (i: Ex) => r("data_itemoflist", { INDEX: i }, list);
    it("indexes the array directly for an index of at least 1", () => {
      expect(item(numEx("i", POS_INT)).c).toBe('(t.l["l1"][i - 1] ?? "")');
      expect(item(lit("1")).c).toBe('(t.l["l1"][0] ?? "")');
      expect(item(lit("5")).c).toBe('(t.l["l1"][4] ?? "")');
    });
    it("keeps the type", () => {
      expect(item(numEx("i", POS_INT)).t).toBe(ANY | STR_TEXT);
    });
    it("keeps the helper for index 0, negatives, fractions, text and unknowns", () => {
      for (const t of [NEG_ZERO, POS_INT | NEG_ZERO, NEG_INT, POS_FRACT, POS_INT | POS_FRACT, STR_NUM, STR_TEXT, ANY]) {
        expect(item(numEx("i", t)).c, String(t)).toBe('itemOf(t.l["l1"], i)');
      }
      expect(item(lit("last")).c).toBe('itemOf(t.l["l1"], "last")');
      expect(item(lit("1.0")).c).toBe('itemOf(t.l["l1"], "1.0")');
      expect(item(lit("1", true)).c).toBe('itemOf(t.l["l1"], "1")');
    });
  });

  describe("replace item", () => {
    const replace = (i: Ex, v: Ex) =>
      statements.data_replaceitemoflist!(block("data_replaceitemoflist", { fields: list as never }), stubGen({ INDEX: i, ITEM: v }));
    it("guards a direct store with the length for a simple index", () => {
      expect(replace(numEx("i", POS_INT), lit("x"))).toEqual(['if (i <= t.l["l1"].length) t.l["l1"][i - 1] = "x";']);
      expect(replace(lit("2"), numEx("v", NUM))).toEqual(['if (2 <= t.l["l1"].length) t.l["l1"][1] = v;']);
    });
    it("evaluates a computed index once, before the item", () => {
      expect(replace(numEx("(a + 1)", POS_INT), numEx("(b * 2)", NUM))).toEqual([
        '{ const r0 = (a + 1); if (r0 <= t.l["l1"].length) t.l["l1"][r0 - 1] = (b * 2); }',
      ]);
    });
    it("keeps the helper for other indexes, and when the item draws a random number", () => {
      expect(replace(numEx("i", POS_INT | NEG_ZERO), lit("x"))).toEqual(['replaceAt(t.l["l1"], i, "x");']);
      expect(replace(numEx("i", POS_INT | ZERO), lit("x"))).toEqual(['if (i > 0 && i <= t.l["l1"].length) t.l["l1"][i - 1] = "x";']);
      expect(replace(lit("last"), lit("x"))).toEqual(['replaceAt(t.l["l1"], "last", "x");']);
      expect(replace(numEx("i", POS_INT), numEx("random(1, 6)", POS_INT))).toEqual(['replaceAt(t.l["l1"], i, random(1, 6));']);
    });
  });

  // Every fast path against its runtime helper, for each index value whose kind it accepts.
  describe("index fast paths match the helpers", () => {
    const indexes: Value[] = [0, 1, 2, 3, 4, 7, 2 ** 31, 2 ** 32 + 2, Number.MAX_VALUE, Infinity];
    const lists: Value[][] = [[], ["a"], ["a", "b", "c"], [10, true, 3.5]];
    const strs = ["", "a", "abc", "0.5"];
    const run = (code: string, scope: Record<string, unknown>) =>
      new Function(...Object.keys(scope), `"use strict"; ${code}`)(...Object.values(scope)) as unknown;
    const fields = { LIST: ["L", "l1"] as [string, string] };
    for (const v of indexes) {
      it(`index ${v}`, () => {
        const i = anyEx("i", typeOfValue(v));
        for (const list of lists) {
          const get = reporters.data_itemoflist!(block("data_itemoflist", { fields: fields as never }), stubGen({ INDEX: i }))!.c;
          expect(get).not.toMatch(/itemOf/);
          const t = { l: { l1: [...list] } };
          expect(run(`return ${get};`, { t, i: v })).toStrictEqual(ops.itemOf([...list], v));
          const set = statements.data_replaceitemoflist!(block("data_replaceitemoflist", { fields: fields as never }), stubGen({ INDEX: i, ITEM: lit("N") }))!;
          expect(set.join("\n")).not.toMatch(/replaceAt/);
          run(set.join("\n"), { t, i: v });
          const want = [...list];
          ops.replaceAt(want, v, "N");
          expect(t.l.l1).toStrictEqual(want);
        }
        for (const str of strs) {
          const code = r("operator_letter_of", { LETTER: i, STRING: strEx("s") }).c;
          expect(code).not.toMatch(/letterOf/);
          // The helper cuts an index of 2^31 or more to 32 bits; a proven whole number is not cut,
          // like TurboWarp's typed path, so it is past the end of every string (deviations.md).
          expect(run(`return ${code};`, { s: str, i: v })).toBe(v < 2 ** 31 ? ops.letterOf(v, str) : "");
        }
      });
    }
  });

  describe("negation", () => {
    const not = (e: Ex) => r("operator_not", { OPERAND: e });
    const until = (e: Ex) => statements.control_repeat_until!(block("control_repeat_until"), stubGen({ CONDITION: e }))![0];
    it("does not stack a negation on a negation", () => {
      const x = boolEx("(a > b)");
      const n1 = not(x);
      expect(n1.c).toBe("!(a > b)");
      const n2 = not(n1);
      expect(n2.c).toBe("(a > b)");
      expect(not(n2).c).toBe("!(a > b)");
      expect(until(n2)).toBe("while (!(a > b)) {");
      expect(until(n1)).toBe("while ((a > b)) {");
      expect(until(x)).toBe("while (!(a > b)) {");
      expect(until(anyEx("v"))).toBe("while (!toBool(v)) {");
    });
    it("casts a non-boolean before negating", () => {
      expect(not(anyEx("v")).c).toBe("!toBool(v)");
      expect(not(not(anyEx("v"))).c).toBe("toBool(v)");
    });
  });
});

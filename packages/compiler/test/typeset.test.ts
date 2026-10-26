import { ops } from "@bytecat/runtime";
import { describe, expect, it } from "vitest";
import {
  ANY, BOOL, NAN, NEG_FRACT, NEG_INF, NEG_INT, NEG_ZERO, NUM, POS_FRACT, POS_INF, POS_INT, STR_NUM, STR_TEXT, ZERO,
  add, castNum, divide, mod, multiply, negate, round, subtract, typeOfValue, within, type TypeSet,
} from "../src/analysis/typeset.js";

// Values of each number kind, chosen near the edges where results change kind: overflow,
// underflow, rounding to whole numbers, and the limits of exact integers.
const samples: Record<number, number[]> = {
  [POS_INT]: [1, 2, 3, 7, 26, 1000003, 2 ** 31, 2 ** 53, 2 ** 53 + 2, 1e300, Number.MAX_VALUE],
  [POS_FRACT]: [0.5, 0.1, 1.5, 2.5, 0.49999999999999994, 1e-300, 5e-324, 0.9999999999999999, 2 ** 52 - 0.5],
  [ZERO]: [0],
  [NEG_ZERO]: [-0],
  [NEG_INT]: [-1, -2, -3, -7, -26, -(2 ** 53), -1e300, -Number.MAX_VALUE],
  [NEG_FRACT]: [-0.5, -0.1, -1.5, -2.5, -0.49999999999999994, -1e-300, -5e-324, -(2 ** 52 - 0.5)],
  [POS_INF]: [Infinity],
  [NEG_INF]: [-Infinity],
};
// Plus seeded random values of every magnitude, so the edges between kinds are probed widely.
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
for (let i = 0; i < 40; i++) {
  const x = (rand() < 0.5 ? rand() : Math.floor(rand() * 1000)) * 10 ** Math.floor(rand() * 40 - 20);
  for (const v of [x, -x]) if (v !== 0) samples[typeOfValue(v)]!.push(v);
}
const kinds = Object.keys(samples).map(Number);

/** Checks a transfer function against every pair of sample values, one kind per operand. */
function checkBinary(name: string, type: (a: TypeSet, b: TypeSet) => TypeSet, op: (x: number, y: number) => number) {
  it(`${name} covers every sampled result`, () => {
    const misses: string[] = [];
    for (const ka of kinds) {
      for (const kb of kinds) {
        const allowed = type(ka, kb);
        for (const x of samples[ka]!) {
          for (const y of samples[kb]!) {
            const r = op(x, y);
            if (!within(typeOfValue(r), allowed)) misses.push(`${name}(${x}, ${y}) = ${r}`);
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it(`${name} is the union over its operands' kinds`, () => {
    for (const ka of kinds) {
      for (const kb of kinds) {
        expect(within(type(ka, kb), type(ka | POS_INT, kb | NEG_FRACT))).toBe(true);
      }
    }
  });
}

describe("number transfer functions", () => {
  checkBinary("add", add, (x, y) => x + y);
  checkBinary("subtract", subtract, (x, y) => x - y);
  checkBinary("multiply", multiply, (x, y) => x * y);
  checkBinary("divide", divide, (x, y) => x / y);
  checkBinary("mod", mod, ops.mod);

  it("round covers every sampled result", () => {
    for (const k of kinds) for (const x of samples[k]!) expect(within(typeOfValue(Math.round(x)), round(k))).toBe(true);
  });

  it("negate swaps signs", () => {
    expect(negate(POS_INT | ZERO)).toBe(NEG_INT | NEG_ZERO);
    expect(negate(negate(NUM))).toBe(NUM);
  });

  it("stays precise where the compiler relies on it", () => {
    // A counter that starts at 1 and adds 1 stays a non-NaN number.
    expect(within(add(POS_INT, POS_INT), NUM)).toBe(true);
    expect(add(POS_INT, POS_INT) & NAN).toBe(0);
    expect(mod(POS_INT | ZERO, POS_INT)).toBe(POS_INT | ZERO);
    expect(multiply(POS_INT, POS_INT) & (NAN | POS_FRACT)).toBe(0);
    // Only an infinity or a zero divisor brings NaN.
    expect(divide(POS_INT, POS_INT) & NAN).toBe(0);
    expect(divide(ZERO, ZERO) & NAN).toBe(NAN);
    expect(add(POS_INF, NEG_INF) & NAN).toBe(NAN);
  });
});

describe("types of values", () => {
  it("classifies values", () => {
    expect(typeOfValue(3)).toBe(POS_INT);
    expect(typeOfValue(-0)).toBe(NEG_ZERO);
    expect(typeOfValue(NaN)).toBe(NAN);
    expect(typeOfValue("12")).toBe(STR_NUM);
    expect(typeOfValue(" 1 ")).toBe(STR_NUM);
    expect(typeOfValue("Infinity")).toBe(STR_NUM);
    expect(typeOfValue("")).toBe(STR_TEXT);
    expect(typeOfValue(" ")).toBe(STR_TEXT);
    expect(typeOfValue("abc")).toBe(STR_TEXT);
    expect(typeOfValue(true)).toBe(BOOL);
  });

  it("castNum covers Scratch's toNum", () => {
    const values = [0, -0, 1, -1.5, NaN, Infinity, -Infinity, "", " ", "abc", "1", " 2 ", "-0", "1e3", "0x10", "Infinity", "-Infinity", "NaN", true, false];
    for (const v of values) expect(within(typeOfValue(ops.toNum(v)), castNum(typeOfValue(v)))).toBe(true);
    expect(within(castNum(ANY), NUM)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ops, type Value } from "../src/index.js";

describe("toNum", () => {
  it("casts like Scratch", () => {
    expect(ops.toNum("")).toBe(0);
    expect(ops.toNum("abc")).toBe(0);
    expect(ops.toNum("3.5")).toBe(3.5);
    expect(ops.toNum(true)).toBe(1);
    expect(ops.toNum(false)).toBe(0);
  });
});

describe("toBool", () => {
  it("treats false, 0 and empty as false", () => {
    expect(ops.toBool("false")).toBe(false);
    expect(ops.toBool("0")).toBe(false);
    expect(ops.toBool("")).toBe(false);
    expect(ops.toBool("abc")).toBe(true);
  });
});

describe("compare", () => {
  it("is numeric when both sides are numbers", () => {
    expect(ops.compare("10", "9")).toBeGreaterThan(0);
    expect(ops.eq("1.0", 1)).toBe(true);
  });
  it("is case-insensitive text otherwise", () => {
    expect(ops.eq("ABC", "abc")).toBe(true);
    expect(ops.lt("apple", "Banana")).toBe(true);
  });
  it("does not treat whitespace as zero", () => {
    expect(ops.eq(" ", 0)).toBe(false);
  });
});

describe("mod", () => {
  it("takes the sign of the divisor", () => {
    expect(ops.mod(-1, 5)).toBe(4);
    expect(ops.mod(7, 5)).toBe(2);
    expect(ops.mod(7, -5)).toBe(-3);
  });
});

describe("lists", () => {
  it("resolves indexes", () => {
    expect(ops.listIndex("last", 3)).toBe(3);
    expect(ops.listIndex(4, 3)).toBe(0);
    expect(ops.listIndex(0, 3)).toBe(0);
    expect(ops.listIndex(2, 3)).toBe(2);
  });
  it("inserts at length + 1", () => {
    const list: Value[] = ["a", "b"];
    ops.insertAt(list, 3, "c");
    expect(list).toEqual(["a", "b", "c"]);
    ops.insertAt(list, 5, "x");
    expect(list).toEqual(["a", "b", "c"]);
  });
  it("joins contents", () => {
    expect(ops.listContents(["a", "b"])).toBe("ab");
    expect(ops.listContents([1, 2])).toBe("1 2");
    expect(ops.listContents(["ab", "c"])).toBe("ab c");
  });
});

describe("strings and math", () => {
  it("returns empty for letters out of range", () => {
    expect(ops.letterOf(0, "abc")).toBe("");
    expect(ops.letterOf(4, "abc")).toBe("");
    expect(ops.letterOf(2, "abc")).toBe("b");
  });
  it("handles trig edge cases", () => {
    expect(ops.mathop("sin", 90)).toBe(1);
    expect(ops.mathop("tan", 90)).toBe(Infinity);
  });
});

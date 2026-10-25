import { describe, expect, it } from "vitest";
import { INF, NUM, POS_INT } from "../src/analysis/typeset.js";
import { sumType } from "../src/cast.js";
import { asAny, asBool, asName, asNum, asStr, isNumeric, numericConstant, isTextLiteral, lit, numEx, numLiteral, strEx, boolEx, anyEx } from "../src/cast.js";

describe("literals", () => {
  it("numLiteral keeps signs and special values", () => {
    expect(numLiteral(5)).toBe("5");
    expect(numLiteral(-5)).toBe("(-5)");
    expect(numLiteral(-0)).toBe("-0");
    expect(numLiteral(Infinity)).toBe("Infinity");
    expect(numLiteral(-Infinity)).toBe("-Infinity");
  });

  it("classifies numeric and text literals", () => {
    expect(isNumeric(lit("12"))).toBe(true);
    expect(isNumeric(lit(" "))).toBe(false);
    expect(isNumeric(lit("abc"))).toBe(false);
    expect(isNumeric(numEx("x", NUM))).toBe(true);
    // A number that may be NaN compares as text in Scratch, so it is not numeric.
    expect(isNumeric(numEx("x"))).toBe(false);
    expect(isNumeric(anyEx("x"))).toBe(false);
    expect(isTextLiteral(lit("abc"))).toBe(true);
    expect(isTextLiteral(lit(" "))).toBe(true);
    expect(isTextLiteral(lit("3"))).toBe(false);
    expect(isTextLiteral(strEx("x"))).toBe(false);
  });
});

describe("numericConstant", () => {
  it("accepts text that prints back as the same number", () => {
    expect(numericConstant("1")).toBe(1);
    expect(numericConstant("0")).toBe(0);
    expect(numericConstant("0.5")).toBe(0.5);
    expect(numericConstant("0.1")).toBe(0.1);
    expect(numericConstant("-3")).toBe(-3);
    expect(numericConstant("1e+21")).toBe(1e21);
    expect(numericConstant("1e-7")).toBe(1e-7);
    expect(numericConstant("5e-324")).toBe(5e-324);
    expect(numericConstant("Infinity")).toBe(Infinity);
    expect(numericConstant("-Infinity")).toBe(-Infinity);
  });

  it("rejects text that a number would print differently", () => {
    for (const s of ["1.0", " 1", "1 ", "-0", "0x10", "1e3", "+1", "01", ".5", "9007199254740993"]) {
      expect(numericConstant(s), JSON.stringify(s)).toBeUndefined();
    }
  });

  it("rejects text that is not a number or is blank", () => {
    for (const s of ["", " ", "  ", "\t", "abc", "NaN", "true"]) {
      expect(numericConstant(s), JSON.stringify(s)).toBeUndefined();
    }
  });
});

describe("casts", () => {
  it("folds literals", () => {
    expect(asNum(lit("3.5"))).toBe("3.5");
    expect(asNum(lit("abc"))).toBe("0");
    expect(asStr(lit('a"b'))).toBe('"a\\"b"');
    expect(asBool(lit("false"))).toBe("false");
    expect(asBool(lit("0"))).toBe("false");
    expect(asBool(lit(""))).toBe("false");
    expect(asBool(lit("x"))).toBe("true");
    expect(asAny(lit("x"))).toBe('"x"');
  });

  it("asAny emits numeric literals as numbers and the rest as strings", () => {
    expect(asAny(lit("1"))).toBe("1");
    expect(asAny(lit("0.5"))).toBe("0.5");
    expect(asAny(lit("-3"))).toBe("(-3)");
    expect(asAny(lit("1e+21"))).toBe("1e+21");
    expect(asAny(lit("Infinity"))).toBe("Infinity");
    expect(asAny(lit("-Infinity"))).toBe("-Infinity");
    expect(asAny(lit("1.0"))).toBe('"1.0"');
    expect(asAny(lit(" 1"))).toBe('" 1"');
    expect(asAny(lit("-0"))).toBe('"-0"');
    expect(asAny(lit(""))).toBe('""');
    expect(asAny(lit("abc"))).toBe('"abc"');
  });

  it("asName keeps every literal a string, since a number never matches an asset name", () => {
    expect(asName(lit("2"))).toBe('"2"');
    expect(asName(lit("costume1"))).toBe('"costume1"');
    expect(asName(anyEx("x"))).toBe("x");
  });

  it("skips casts that cannot change the value", () => {
    expect(asNum(numEx("a", NUM))).toBe("a");
    expect(asNum(anyEx("a", POS_INT))).toBe("a");
    expect(asStr(strEx("a"))).toBe("a");
    expect(asBool(boolEx("a"))).toBe("a");
    expect(asAny(anyEx("a"))).toBe("a");
  });

  it("casts a number that may be NaN", () => {
    expect(asNum(numEx("a"))).toBe("toNum(a)");
    expect(asStr(numEx("a"))).toBe('("" + a)');
  });

  it("converts between known types", () => {
    expect(asNum(boolEx("a"))).toBe("(+a)");
    expect(asStr(numEx("a"))).toBe('("" + a)');
    expect(asStr(boolEx("a"))).toBe('(a ? "true" : "false")');
  });

  it("calls the runtime helper for unknown types", () => {
    expect(asNum(anyEx("a"))).toBe("toNum(a)");
    expect(asStr(anyEx("a"))).toBe("toStr(a)");
    expect(asBool(anyEx("a"))).toBe("toBool(a)");
    expect(asBool(strEx("a"))).toBe("toBool(a)");
  });
});

describe("sumType", () => {
  it("adding a small literal never overflows to Infinity", () => {
    expect(sumType(anyEx("i", POS_INT), lit("1")) & INF).toBe(0);
    expect(sumType(anyEx("i", POS_INT), lit("1"), true) & INF).toBe(0);
    // A huge literal, or an operand that is already infinite, still can.
    expect(sumType(anyEx("i", POS_INT), lit("1e308")) & INF).not.toBe(0);
    expect(sumType(anyEx("i", POS_INT | INF), lit("1")) & INF).not.toBe(0);
    expect(sumType(anyEx("i", POS_INT), anyEx("j", POS_INT)) & INF).not.toBe(0);
  });

  it("is right at the edge: the largest double plus just under 2^970 stays finite", () => {
    expect(Number.MAX_VALUE + 2 ** 970 * (1 - 2 ** -52)).toBe(Number.MAX_VALUE);
    expect(Number.MAX_VALUE + 2 ** 970).toBe(Infinity);
  });
});

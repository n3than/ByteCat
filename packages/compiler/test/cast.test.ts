import { describe, expect, it } from "vitest";
import { asAny, asBool, asNum, asStr, isNumeric, isTextLiteral, lit, numEx, numLiteral, strEx, boolEx, anyEx } from "../src/cast.js";

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
    expect(isNumeric(numEx("x"))).toBe(true);
    expect(isNumeric(anyEx("x"))).toBe(false);
    expect(isTextLiteral(lit("abc"))).toBe(true);
    expect(isTextLiteral(lit(" "))).toBe(true);
    expect(isTextLiteral(lit("3"))).toBe(false);
    expect(isTextLiteral(strEx("x"))).toBe(false);
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

  it("skips casts that cannot change the value", () => {
    expect(asNum(numEx("a"))).toBe("a");
    expect(asStr(strEx("a"))).toBe("a");
    expect(asBool(boolEx("a"))).toBe("a");
    expect(asAny(anyEx("a"))).toBe("a");
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

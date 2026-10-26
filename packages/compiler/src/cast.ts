import {
  ANY, BOOL, INF, NUM, NUM_OR_NAN, STR, add, castNum, subtract as subtractTypes, typeOfValue, within, type TypeSet,
} from "./analysis/typeset.js";
import type { Ex } from "./types.js";

/**
 * A literal known at compile time. Its type is that of the value `asAny` passes on: a number for
 * a numeric constant, else the string. `text` keeps it a string (see `TargetCodegen.input`).
 */
export function lit(value: string, text = false): Ex {
  const n = text ? undefined : numericConstant(value);
  return { c: JSON.stringify(value), t: typeOfValue(n ?? value), k: value, ...(text ? { text } : {}) };
}

/** A number expression; without a more precise type it may be any number, NaN included. */
export const numEx = (c: string, t: TypeSet = NUM_OR_NAN): Ex => ({ c, t });
export const boolEx = (c: string): Ex => ({ c, t: BOOL });
export const strEx = (c: string): Ex => ({ c, t: STR });
export const anyEx = (c: string, t: TypeSet = ANY): Ex => ({ c, t });

/** Scratch's number parsing for a literal: anything that is not a number is 0. */
export function toNumber(s: string): number {
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

export function numLiteral(n: number): string {
  if (Object.is(n, -0)) return "-0";
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  return n < 0 ? `(${n})` : String(n);
}

/** The type of an expression after Scratch's number cast; a literal is cast at compile time. */
export function numType(e: Ex): TypeSet {
  return e.k !== undefined ? typeOfValue(toNumber(e.k)) : castNum(e.t);
}

/**
 * The type of `x + y` (or `x - y`) after both are cast to numbers. A sum overflows to Infinity
 * only when both sides are huge: adding a finite number below 2^970 (half the spacing of doubles
 * near the largest one) to any finite number rounds to a finite result. So a counter that adds a
 * literal such as 1 never becomes infinite, which keeps NaN out of later products like `i * 0`.
 */
export function sumType(x: Ex, y: Ex, subtract = false): TypeSet {
  const tx = numType(x);
  const ty = numType(y);
  const t = subtract ? subtractTypes(tx, ty) : add(tx, ty);
  const small = (e: Ex) => e.k !== undefined && Math.abs(toNumber(e.k)) < 2 ** 970;
  if ((small(x) && !(ty & INF)) || (small(y) && !(tx & INF))) return t & ~INF;
  return t;
}

/** True when an expression is certainly a number other than NaN: a numeric literal or a typed value. */
export function isNumeric(e: Ex): boolean {
  if (e.k !== undefined) return e.k.trim() !== "" && !Number.isNaN(Number(e.k));
  return within(e.t, NUM);
}

/** True for a literal that Scratch compares as text: not a number, or only whitespace. */
export function isTextLiteral(e: Ex): boolean {
  return e.k !== undefined && (e.k.trim() === "" || Number.isNaN(Number(e.k)));
}

// ---- casts: JavaScript source that evaluates the expression as the given type ----
// A cast is left out when the expression's type proves it would return the value unchanged.

export function asNum(e: Ex): string {
  if (e.k !== undefined) return numLiteral(toNumber(e.k));
  if (within(e.t, NUM)) return e.c;
  if (within(e.t, BOOL)) return `(+${e.c})`;
  return `toNum(${e.c})`;
}

export function asStr(e: Ex): string {
  if (e.k !== undefined) return JSON.stringify(e.k);
  if (within(e.t, STR)) return e.c;
  if (within(e.t, NUM_OR_NAN)) return `("" + ${e.c})`;
  if (within(e.t, BOOL)) return `(${e.c} ? "true" : "false")`;
  return `toStr(${e.c})`;
}

export function asBool(e: Ex): string {
  if (e.k !== undefined) return String(e.k !== "" && e.k !== "0" && e.k.toLowerCase() !== "false");
  if (within(e.t, BOOL)) return e.c;
  return `toBool(${e.c})`;
}

/**
 * JavaScript for the negation of a condition (`until` loops, `not`). Negating a `not` returns the
 * code it wrapped instead of stacking another `!`, so `until not (not x)` is `while (!x)`.
 */
export function notCode(e: Ex): string {
  return e.neg ?? `!${asBool(e)}`;
}

/** A boolean expression that is the negation of `inner`, which must already be boolean JavaScript. */
export function negation(inner: string): Ex {
  return { c: `!${inner}`, t: BOOL, neg: inner };
}

/**
 * True when evaluating the expression changes something another expression can see: it draws a
 * random number (moving the generator on) or reads a clock. Every other generated expression is a
 * pure read, so it can be evaluated in any order, any number of times, or not at all. Two
 * expressions may swap places unless both are effectful.
 */
export function effectful(e: Ex): boolean {
  return e.k === undefined && /\b(random|timer|daysSince2000)\(/.test(e.c);
}

/** True for an expression that is one pure read (a literal, variable or property), cheap to repeat. */
export function simple(e: Ex): boolean {
  return e.k !== undefined || !e.c.includes("(");
}

/** JavaScript for `index - 1` of an index whose type is POS_INT, folded for a literal. */
export function indexMinusOne(e: Ex): string {
  return e.k !== undefined ? String(toNumber(e.k) - 1) : `${e.c} - 1`;
}

/**
 * The number a literal can be stored as without anyone noticing, or undefined when it must stay
 * text. This is TurboWarp's rule (`createConstantInput` in its irgen): with `n = +s`, the literal
 * becomes a number when `n` is not NaN, `s` is not blank (or contains a tab), and `n.toString()`
 * is exactly `s`. So "1", "0.5", "-3", "1e+21" and "Infinity" become numbers, while "1.0", " 1",
 * "-0", "0x10", "1e3", "" and "abc" stay text, because turning those into numbers would change
 * what `join`, `say` or a list shows. Storing numbers saves every later read a `toNum`.
 */
export function numericConstant(s: string): number | undefined {
  const n = +s;
  if (Number.isNaN(n)) return undefined;
  if (s.trim() === "" && !s.includes("\t")) return undefined;
  return n.toString() === s ? n : undefined;
}

/**
 * An input passed on without a cast. A numeric literal (see `numericConstant`) is emitted as a
 * JavaScript number, any other literal as a string.
 */
export function asAny(e: Ex): string {
  if (e.k === undefined) return e.c;
  const n = e.text ? undefined : numericConstant(e.k);
  return n === undefined ? JSON.stringify(e.k) : numLiteral(n);
}

/**
 * A literal that must stay a string. Used for inputs that name a costume, backdrop or sound, and
 * (through `TargetCodegen.any`) for any literal equal to such a name. A number never matches a
 * name (`Runtime.switchCostume` compares with `===`) but a string that matches no name and looks
 * like a number picks the costume at that index, which is exactly what the number would have
 * done. So keeping the string is always safe, and it keeps a costume named "2" reachable by
 * `switch costume to "2"`. TurboWarp does the same, but only for names that exist
 * (`preserveStrings`); the results are identical.
 */
export function asName(e: Ex): string {
  return e.k !== undefined ? JSON.stringify(e.k) : e.c;
}

export function indent(lines: string[], levels = 1): string[] {
  const pad = "  ".repeat(levels);
  return lines.map((l) => pad + l);
}

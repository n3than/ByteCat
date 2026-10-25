import type { Ex } from "./types.js";

/** A string literal known at compile time. */
export function lit(value: string): Ex {
  return { c: JSON.stringify(value), t: "str", k: value };
}

export const numEx = (c: string): Ex => ({ c, t: "num" });
export const boolEx = (c: string): Ex => ({ c, t: "bool" });
export const strEx = (c: string): Ex => ({ c, t: "str" });
export const anyEx = (c: string): Ex => ({ c, t: "any" });

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

/** True when an expression is certainly a number: a numeric literal or an arithmetic result. */
export function isNumeric(e: Ex): boolean {
  if (e.k !== undefined) return e.k.trim() !== "" && !Number.isNaN(Number(e.k));
  return e.t === "num";
}

/** True for a literal that Scratch compares as text: not a number, or only whitespace. */
export function isTextLiteral(e: Ex): boolean {
  return e.k !== undefined && (e.k.trim() === "" || Number.isNaN(Number(e.k)));
}

// ---- casts: JavaScript source that evaluates the expression as the given type ----

export function asNum(e: Ex): string {
  if (e.k !== undefined) return numLiteral(toNumber(e.k));
  if (e.t === "num") return e.c;
  if (e.t === "bool") return `(+${e.c})`;
  return `toNum(${e.c})`;
}

export function asStr(e: Ex): string {
  if (e.k !== undefined) return JSON.stringify(e.k);
  if (e.t === "str") return e.c;
  if (e.t === "num") return `("" + ${e.c})`;
  if (e.t === "bool") return `(${e.c} ? "true" : "false")`;
  return `toStr(${e.c})`;
}

export function asBool(e: Ex): string {
  if (e.k !== undefined) return String(e.k !== "" && e.k !== "0" && e.k.toLowerCase() !== "false");
  if (e.t === "bool") return e.c;
  return `toBool(${e.c})`;
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
  const n = numericConstant(e.k);
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

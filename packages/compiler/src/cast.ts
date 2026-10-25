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

export function asAny(e: Ex): string {
  if (e.k !== undefined) return JSON.stringify(e.k);
  return e.c;
}

export function indent(lines: string[], levels = 1): string[] {
  const pad = "  ".repeat(levels);
  return lines.map((l) => pad + l);
}

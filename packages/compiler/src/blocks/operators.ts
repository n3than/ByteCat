import type { Block } from "@bytecat/sb3";
import type { Ex, Gen, ReporterHandler } from "../types.js";
import {
  ANY_ZERO, FRACT, INF, NEG_INT, NUM_OR_NAN, POS_FRACT, POS_INF, POS_INT, STR_TEXT, ZERO,
  divide, mod, multiply, round, within, type TypeSet,
} from "../analysis/typeset.js";
import { asAny, asNum, asStr, boolEx, isNumeric, isTextLiteral, numEx, numType, strEx, sumType } from "../cast.js";

/** An arithmetic operator: the JavaScript for `NUM1 op NUM2` and its type from the operand types. */
function arith(b: Block, g: Gen, js: (x: string, y: string) => string, type: (x: TypeSet, y: TypeSet) => TypeSet): Ex {
  const x = g.input(b, "NUM1");
  const y = g.input(b, "NUM2");
  return numEx(js(asNum(x), asNum(y)), type(numType(x), numType(y)));
}

/** The type of `mathop` for the operators whose results are easy to bound; NaN can come from the rest. */
function mathopType(op: string, x: TypeSet): TypeSet {
  switch (op) {
    case "abs": {
      let r = 0;
      if (x & (POS_INT | NEG_INT)) r |= POS_INT;
      if (x & FRACT) r |= POS_FRACT;
      if (x & INF) r |= POS_INF;
      if (x & ANY_ZERO) r |= ZERO;
      return r;
    }
    case "floor":
    case "ceiling": return round(x);
    default: return NUM_OR_NAN;
  }
}

/** Comparison of two inputs, using the cheapest form that keeps Scratch's mixed-type rules. */
export function comparison(b: Block, g: Gen, jsOp: string, helper: string): Ex {
  const a = g.input(b, "OPERAND1");
  const c = g.input(b, "OPERAND2");
  // Two numbers compare with plain JS operators; anything else needs Scratch's mixed rules.
  if (isNumeric(a) && isNumeric(c)) return boolEx(`(${asNum(a)} ${jsOp} ${asNum(c)})`);
  // Equality with a number other than NaN can use === when the other side is a number (NaN
  // compares as the text "NaN", which equals no number) or a string that is not numeric (it
  // compares as text, and no number prints as such a string). A boolean or a numeric string
  // would need converting first. Two NaNs are equal in Scratch, so one side must not be NaN.
  const maybeNaN = (e: Ex) => e.k === undefined && within(e.t, NUM_OR_NAN | STR_TEXT);
  if (jsOp === "===" && ((isNumeric(a) && maybeNaN(c)) || (maybeNaN(a) && isNumeric(c)))) {
    // The raw value, not asNum: the cast would turn NaN and text into 0.
    const side = (e: Ex) => (maybeNaN(e) ? e.c : asNum(e));
    return boolEx(`(${side(a)} === ${side(c)})`);
  }
  // A literal that is not a number makes the comparison case-insensitive text, whatever the
  // other side holds.
  if (isTextLiteral(a) || isTextLiteral(c)) {
    const lower = (e: Ex) => (e.k !== undefined ? JSON.stringify(e.k.toLowerCase()) : `${asStr(e)}.toLowerCase()`);
    return boolEx(`(${lower(a)} ${jsOp} ${lower(c)})`);
  }
  // asAny passes a numeric literal as a number, which saves the helper from parsing it.
  return boolEx(`${helper}(${asAny(a)}, ${asAny(c)})`);
}

export const operatorReporters: Record<string, ReporterHandler> = {
  operator_add: (b, g) => {
    const x = g.input(b, "NUM1");
    const y = g.input(b, "NUM2");
    return numEx(`(${asNum(x)} + ${asNum(y)})`, sumType(x, y));
  },
  operator_subtract: (b, g) => {
    const x = g.input(b, "NUM1");
    const y = g.input(b, "NUM2");
    return numEx(`(${asNum(x)} - ${asNum(y)})`, sumType(x, y, true));
  },
  operator_multiply: (b, g) => arith(b, g, (x, y) => `(${x} * ${y})`, multiply),
  operator_divide: (b, g) => arith(b, g, (x, y) => `(${x} / ${y})`, divide),
  operator_mod: (b, g) => arith(b, g, (x, y) => `mod(${x}, ${y})`, mod),
  operator_random: (b, g) => numEx(`random(${g.any(b, "FROM")}, ${g.any(b, "TO")})`),
  operator_lt: (b, g) => comparison(b, g, "<", "lt"),
  operator_gt: (b, g) => comparison(b, g, ">", "gt"),
  operator_equals: (b, g) => comparison(b, g, "===", "eq"),
  operator_and: (b, g) => boolEx(`(${g.bool(b, "OPERAND1")} && ${g.bool(b, "OPERAND2")})`),
  operator_or: (b, g) => boolEx(`(${g.bool(b, "OPERAND1")} || ${g.bool(b, "OPERAND2")})`),
  operator_not: (b, g) => boolEx(`!${g.bool(b, "OPERAND")}`),
  operator_join: (b, g) => strEx(`(${g.str(b, "STRING1")} + ${g.str(b, "STRING2")})`),
  operator_letter_of: (b, g) => strEx(`letterOf(${g.any(b, "LETTER")}, ${g.any(b, "STRING")})`),
  operator_length: (b, g) => numEx(`${g.str(b, "STRING")}.length`, POS_INT | ZERO),
  operator_contains: (b, g) => boolEx(`contains(${g.any(b, "STRING1")}, ${g.any(b, "STRING2")})`),
  operator_round: (b, g) => {
    const x = g.input(b, "NUM");
    return numEx(`Math.round(${asNum(x)})`, round(numType(x)));
  },
  operator_mathop: (b, g) => {
    const op = g.field(b, "OPERATOR").toLowerCase();
    const x = g.input(b, "NUM");
    return numEx(`mathop(${JSON.stringify(op)}, ${asNum(x)})`, mathopType(op, numType(x)));
  },
};

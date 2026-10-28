import type { Block } from "@bytecat/sb3";
import type { Ex, Gen } from "../types.js";
import { boolean, reporter, type Extension } from "./api.js";
import {
  ANY_ZERO, BOOL, FRACT, WHOLE_INDEX, INF, NEG_INT, NUM_OR_NAN, POS_FRACT, POS_INF, POS_INT, POS_REAL, STR_TEXT, ZERO,
  divide, mod, multiply, round, within, type TypeSet,
} from "../analysis/typeset.js";
import {
  asAny, asBool, asNum, asStr, boolEx, effectful, isNumeric, isTextLiteral, negation, numEx, numType, strEx, sumType, toNumber,
} from "../cast.js";

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
  // Infinity is the exception among numbers: it prints as "Infinity", which equals the text
  // "infinity" ignoring case, so against a possible string the number must be finite.
  const maybeNaN = (e: Ex) => e.k === undefined && within(e.t, NUM_OR_NAN | STR_TEXT);
  const plain = (n: Ex, other: Ex) => isNumeric(n) && maybeNaN(other) && !(other.t & STR_TEXT && numType(n) & INF);
  if (jsOp === "===" && (plain(a, c) || plain(c, a))) {
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

export const operator: Extension = {
  id: "operator",
  name: "Operators",
  blocks: {
    operator_add: reporter((b, g) => {
      const x = g.input(b, "NUM1");
      const y = g.input(b, "NUM2");
      return numEx(`(${asNum(x)} + ${asNum(y)})`, sumType(x, y));
    }),
    operator_subtract: reporter((b, g) => {
      const x = g.input(b, "NUM1");
      const y = g.input(b, "NUM2");
      return numEx(`(${asNum(x)} - ${asNum(y)})`, sumType(x, y, true));
    }),
    operator_multiply: reporter((b, g) => arith(b, g, (x, y) => `(${x} * ${y})`, multiply)),
    operator_divide: reporter((b, g) => arith(b, g, (x, y) => `(${x} / ${y})`, divide)),
    operator_random: reporter((b, g) => numEx(`random(${g.any(b, "FROM")}, ${g.any(b, "TO")})`), { uses: ["random"] }),
    operator_gt: boolean((b, g) => comparison(b, g, ">", "gt"), { uses: ["gt"] }),
    operator_lt: boolean((b, g) => comparison(b, g, "<", "lt"), { uses: ["lt"] }),
    operator_equals: boolean((b, g) => comparison(b, g, "===", "eq"), { uses: ["eq"] }),
    operator_and: boolean((b, g) => boolEx(`(${g.bool(b, "OPERAND1")} && ${g.bool(b, "OPERAND2")})`)),
    operator_or: boolean((b, g) => boolEx(`(${g.bool(b, "OPERAND1")} || ${g.bool(b, "OPERAND2")})`)),
    operator_not: boolean((b, g) => {
      const x = g.input(b, "OPERAND");
      // not (not y) is y as a boolean; the negation of that is the `!y` already written.
      return x.neg !== undefined ? { c: x.neg, t: BOOL, neg: `!${x.neg}` } : negation(asBool(x));
    }),
    operator_join: reporter((b, g) => strEx(`(${g.str(b, "STRING1")} + ${g.str(b, "STRING2")})`)),
    operator_letter_of: reporter(
      (b, g) => {
        const i = g.input(b, "LETTER");
        const s = g.input(b, "STRING");
        // The helper evaluates the index first; `s.charAt(i - 1)` evaluates the string first, which
        // only matters when both draw random numbers or read a clock. For an index >= 1, `i - 1 >= 0`,
        // and `charAt` gives "" past the end like the helper. A text literal index never gets here:
        // its type is not POS_INT.
        // An index of 0 gives charAt(-1) and Infinity charAt(Infinity), both "" like the helper. The
        // helper cuts an index of 2^31 or more to 32 bits, as TurboWarp does when it cannot prove the
        // type; for a proven whole number TurboWarp skips the cut, and so does this (deviations.md).
        if (within(i.t, WHOLE_INDEX) && !(effectful(i) && effectful(s))) {
          return strEx(`${asStr(s)}.charAt(${i.k !== undefined ? toNumber(i.k) - 1 : `${i.c} - 1`})`);
        }
        return strEx(`letterOf(${asAny(i)}, ${asAny(s)})`);
      },
      { uses: ["letterOf"] },
    ),
    operator_length: reporter((b, g) => numEx(`${g.str(b, "STRING")}.length`, POS_INT | ZERO)),
    operator_contains: boolean((b, g) => boolEx(`contains(${g.any(b, "STRING1")}, ${g.any(b, "STRING2")})`), { uses: ["contains"] }),
    operator_mod: reporter(
      (b, g) => {
        const x = g.input(b, "NUM1");
        const y = g.input(b, "NUM2");
        const tx = numType(x);
        const ty = numType(y);
        // A dividend that is +0 or positive (not -0, NaN or infinite) and a positive finite divisor
        // give `n % m >= +0`, so `mod`'s sign correction (`r / m < 0`) never fires.
        const plain = within(tx, POS_REAL | ZERO) && within(ty, POS_REAL);
        return numEx(plain ? `(${asNum(x)} % ${asNum(y)})` : `mod(${asNum(x)}, ${asNum(y)})`, mod(tx, ty));
      },
      { uses: ["mod"] },
    ),
    operator_round: reporter((b, g) => {
      const x = g.input(b, "NUM");
      return numEx(`Math.round(${asNum(x)})`, round(numType(x)));
    }),
    operator_mathop: reporter(
      (b, g) => {
        const op = g.field(b, "OPERATOR").toLowerCase();
        const x = g.input(b, "NUM");
        return numEx(`mathop(${JSON.stringify(op)}, ${asNum(x)})`, mathopType(op, numType(x)));
      },
      { uses: ["mathop"] },
    ),
  },
};

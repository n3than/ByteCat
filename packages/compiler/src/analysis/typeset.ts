// The static types the compiler tracks for values, as a bit set: a type is the set of runtime
// kinds a value might have. Numbers are split finely enough to know when an operation can produce
// NaN, -0, a fraction or Infinity, since those are exactly where Scratch's casts change values.
// A cast can be left out only when the type proves it would return its input unchanged.

export const POS_INT = 0x001;
export const POS_FRACT = 0x002;
export const ZERO = 0x004;
export const NEG_ZERO = 0x008;
export const NEG_INT = 0x010;
export const NEG_FRACT = 0x020;
export const POS_INF = 0x040;
export const NEG_INF = 0x080;
export const NAN = 0x100;
/** A string Scratch reads as a number: not blank, and `Number(s)` is not NaN. */
export const STR_NUM = 0x200;
/** Any other string, including "" and whitespace. */
export const STR_TEXT = 0x400;
export const BOOL = 0x800;

export const POS_REAL = POS_INT | POS_FRACT;
export const NEG_REAL = NEG_INT | NEG_FRACT;
export const POS = POS_REAL | POS_INF;
export const NEG = NEG_REAL | NEG_INF;
export const ANY_ZERO = ZERO | NEG_ZERO;
export const INF = POS_INF | NEG_INF;
export const FRACT = POS_FRACT | NEG_FRACT;
export const INT = POS_INT | NEG_INT | ANY_ZERO;
/** Every number except NaN. */
export const NUM = POS | NEG | ANY_ZERO;
export const NUM_OR_NAN = NUM | NAN;
export const STR = STR_NUM | STR_TEXT;
export const ANY = NUM_OR_NAN | STR | BOOL;

export type TypeSet = number;

/** True when every value of type `t` is also of type `of`. The empty type is a subset of all. */
export function within(t: TypeSet, of: TypeSet): boolean {
  return (t & of) === t;
}

/** The type of one JavaScript value. */
export function typeOfValue(v: unknown): TypeSet {
  if (typeof v === "boolean") return BOOL;
  if (typeof v === "string") return v.trim() !== "" && !Number.isNaN(Number(v)) ? STR_NUM : STR_TEXT;
  if (typeof v !== "number") return ANY;
  if (Number.isNaN(v)) return NAN;
  if (v === Infinity) return POS_INF;
  if (v === -Infinity) return NEG_INF;
  if (v === 0) return Object.is(v, -0) ? NEG_ZERO : ZERO;
  if (v > 0) return Number.isInteger(v) ? POS_INT : POS_FRACT;
  return Number.isInteger(v) ? NEG_INT : NEG_FRACT;
}

/** The type of Scratch's number cast (`toNum`) applied to a value of type `t`. */
export function castNum(t: TypeSet): TypeSet {
  let r = t & NUM;
  if (t & (NAN | STR_TEXT)) r |= ZERO;
  if (t & STR_NUM) r |= NUM;
  if (t & BOOL) r |= ZERO | POS_INT;
  return r;
}

const has = (t: TypeSet, bits: TypeSet) => (t & bits) !== 0;

/**
 * Sign and integrality of a sum, difference or product whose operands are `a` and `b`, given
 * which signs the result can take. A result that can be non-zero with some sign can also be an
 * integer of that sign (fractions can add up to whole numbers) or overflow to that infinity.
 */
function signed(pos: boolean, neg: boolean, fract: boolean): TypeSet {
  let r = 0;
  if (pos) r |= POS_INT | POS_INF | (fract ? POS_FRACT : 0);
  if (neg) r |= NEG_INT | NEG_INF | (fract ? NEG_FRACT : 0);
  return r;
}

/** `a + b` for operands already cast to numbers (no NaN). */
export function add(a: TypeSet, b: TypeSet): TypeSet {
  const fract = has(a, FRACT) || has(b, FRACT);
  let r = signed(has(a, POS) || has(b, POS), has(a, NEG) || has(b, NEG), fract);
  if ((has(a, POS_INF) && has(b, NEG_INF)) || (has(a, NEG_INF) && has(b, POS_INF))) r |= NAN;
  // x + -x is +0, and so is 0 + 0 and 0 + -0; only -0 + -0 is -0.
  if ((has(a, POS_REAL) && has(b, NEG_REAL)) || (has(a, NEG_REAL) && has(b, POS_REAL))) r |= ZERO;
  if ((has(a, ZERO) && has(b, ANY_ZERO)) || (has(a, NEG_ZERO) && has(b, ZERO))) r |= ZERO;
  if (has(a, NEG_ZERO) && has(b, NEG_ZERO)) r |= NEG_ZERO;
  // A zero operand returns the other operand unchanged.
  if (has(a, ANY_ZERO)) r |= b & ~ANY_ZERO;
  if (has(b, ANY_ZERO)) r |= a & ~ANY_ZERO;
  return r;
}

/** Negation, used to express subtraction as addition. */
export function negate(t: TypeSet): TypeSet {
  let r = t & (NAN | STR | BOOL);
  if (t & POS_INT) r |= NEG_INT;
  if (t & POS_FRACT) r |= NEG_FRACT;
  if (t & POS_INF) r |= NEG_INF;
  if (t & NEG_INT) r |= POS_INT;
  if (t & NEG_FRACT) r |= POS_FRACT;
  if (t & NEG_INF) r |= POS_INF;
  if (t & ZERO) r |= NEG_ZERO;
  if (t & NEG_ZERO) r |= ZERO;
  return r;
}

/** `a - b` for operands already cast to numbers. In IEEE arithmetic it is exactly `a + -b`. */
export function subtract(a: TypeSet, b: TypeSet): TypeSet {
  return add(a, negate(b));
}

/** `a * b` for operands already cast to numbers. */
export function multiply(a: TypeSet, b: TypeSet): TypeSet {
  const fract = has(a, FRACT) || has(b, FRACT);
  const pos = (has(a, POS) && has(b, POS)) || (has(a, NEG) && has(b, NEG));
  const neg = (has(a, POS) && has(b, NEG)) || (has(a, NEG) && has(b, POS));
  let r = signed(pos, neg, fract);
  if ((has(a, INF) && has(b, ANY_ZERO)) || (has(a, ANY_ZERO) && has(b, INF))) r |= NAN;
  // A zero operand, or two tiny fractions underflowing, gives a zero whose sign is the product's.
  const zeroish = (t: TypeSet) => (t & (ANY_ZERO | FRACT)) !== 0;
  if (zeroish(a) || zeroish(b)) {
    const aPos = has(a, POS_REAL | ZERO);
    const aNeg = has(a, NEG_REAL | NEG_ZERO);
    const bPos = has(b, POS_REAL | ZERO);
    const bNeg = has(b, NEG_REAL | NEG_ZERO);
    if ((aPos && bPos) || (aNeg && bNeg)) r |= ZERO;
    if ((aPos && bNeg) || (aNeg && bPos)) r |= NEG_ZERO;
  }
  return r;
}

/** `a / b` for operands already cast to numbers. */
export function divide(a: TypeSet, b: TypeSet): TypeSet {
  const pos = (has(a, POS) && has(b, POS | ZERO)) || (has(a, NEG) && has(b, NEG | NEG_ZERO));
  const neg = (has(a, POS) && has(b, NEG | NEG_ZERO)) || (has(a, NEG) && has(b, POS | ZERO));
  // Division makes fractions from integers, and overflows or divides by zero to infinity.
  let r = signed(pos, neg, true);
  if ((has(a, ANY_ZERO) && has(b, ANY_ZERO)) || (has(a, INF) && has(b, INF))) r |= NAN;
  // 0 / x, x / Infinity and underflow give zeros, signed like the quotient.
  const aPos = has(a, POS | ZERO);
  const aNeg = has(a, NEG | NEG_ZERO);
  const bPos = has(b, POS | ZERO);
  const bNeg = has(b, NEG | NEG_ZERO);
  if ((aPos && bPos) || (aNeg && bNeg)) r |= ZERO;
  if ((aPos && bNeg) || (aNeg && bPos)) r |= NEG_ZERO;
  return r;
}

/** Scratch's `mod`: the remainder takes the divisor's sign. Operands already cast to numbers. */
export function mod(a: TypeSet, b: TypeSet): TypeSet {
  let r = 0;
  if (has(a, INF) || has(b, ANY_ZERO)) r |= NAN;
  const fract = has(a, FRACT) || has(b, FRACT);
  const finiteA = a & ~INF;
  // A finite dividend and a finite divisor: the result is 0, -0 (from a -0 or negative dividend
  // that divides evenly) or has the divisor's sign.
  if (finiteA && has(b, POS_REAL | NEG_REAL)) {
    r |= ZERO;
    if (has(finiteA, NEG_REAL | NEG_ZERO)) r |= NEG_ZERO;
    if (has(b, POS_REAL) && has(finiteA, POS_REAL | NEG_REAL)) r |= POS_INT | (fract ? POS_FRACT : 0);
    if (has(b, NEG_REAL) && has(finiteA, POS_REAL | NEG_REAL)) r |= NEG_INT | (fract ? NEG_FRACT : 0);
  }
  // An infinite divisor returns a finite dividend unchanged. So can a finite one when a tiny
  // fractional remainder divided by it underflows to -0, skipping the sign correction.
  if (has(b, INF)) r |= finiteA;
  if (has(b, POS_REAL | NEG_REAL)) r |= finiteA & FRACT;
  return r;
}

/** `Math.round` of a number (no NaN). Rounding -0.5 to -0 keeps the sign. */
export function round(a: TypeSet): TypeSet {
  let r = a & (INT | INF);
  if (a & POS_FRACT) r |= POS_INT | ZERO;
  if (a & NEG_FRACT) r |= NEG_INT | NEG_ZERO;
  return r;
}

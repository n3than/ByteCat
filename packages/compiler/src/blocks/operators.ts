import type { Block } from "@bytecat/sb3";
import type { Ex, Gen, ReporterHandler } from "../types.js";
import { asAny, asNum, asStr, boolEx, isNumeric, isTextLiteral, numEx, numLiteral, strEx } from "../cast.js";

/** Comparison of two inputs, using the cheapest form that keeps Scratch's mixed-type rules. */
export function comparison(b: Block, g: Gen, jsOp: string, helper: string): Ex {
  const a = g.input(b, "OPERAND1");
  const c = g.input(b, "OPERAND2");
  // Two numbers compare with plain JS operators; anything else needs Scratch's mixed rules.
  if (isNumeric(a) && isNumeric(c)) return boolEx(`(${asNum(a)} ${jsOp} ${asNum(c)})`);
  // A literal that is not a number makes the comparison case-insensitive text, whatever the
  // other side holds.
  if (isTextLiteral(a) || isTextLiteral(c)) {
    const lower = (e: Ex) => (e.k !== undefined ? JSON.stringify(e.k.toLowerCase()) : `${asStr(e)}.toLowerCase()`);
    return boolEx(`(${lower(a)} ${jsOp} ${lower(c)})`);
  }
  // A numeric literal can be passed as a number when it prints back the same, which saves the
  // helper from parsing it on every call.
  const arg = (e: Ex) => (e.k !== undefined && String(Number(e.k)) === e.k ? numLiteral(Number(e.k)) : asAny(e));
  return boolEx(`${helper}(${arg(a)}, ${arg(c)})`);
}

export const operatorReporters: Record<string, ReporterHandler> = {
  operator_add: (b, g) => numEx(`(${g.num(b, "NUM1")} + ${g.num(b, "NUM2")})`),
  operator_subtract: (b, g) => numEx(`(${g.num(b, "NUM1")} - ${g.num(b, "NUM2")})`),
  operator_multiply: (b, g) => numEx(`(${g.num(b, "NUM1")} * ${g.num(b, "NUM2")})`),
  operator_divide: (b, g) => numEx(`(${g.num(b, "NUM1")} / ${g.num(b, "NUM2")})`),
  operator_mod: (b, g) => numEx(`mod(${g.num(b, "NUM1")}, ${g.num(b, "NUM2")})`),
  operator_random: (b, g) => numEx(`random(${g.any(b, "FROM")}, ${g.any(b, "TO")})`),
  operator_lt: (b, g) => comparison(b, g, "<", "lt"),
  operator_gt: (b, g) => comparison(b, g, ">", "gt"),
  operator_equals: (b, g) => comparison(b, g, "===", "eq"),
  operator_and: (b, g) => boolEx(`(${g.bool(b, "OPERAND1")} && ${g.bool(b, "OPERAND2")})`),
  operator_or: (b, g) => boolEx(`(${g.bool(b, "OPERAND1")} || ${g.bool(b, "OPERAND2")})`),
  operator_not: (b, g) => boolEx(`!${g.bool(b, "OPERAND")}`),
  operator_join: (b, g) => strEx(`(${g.str(b, "STRING1")} + ${g.str(b, "STRING2")})`),
  operator_letter_of: (b, g) => strEx(`letterOf(${g.any(b, "LETTER")}, ${g.any(b, "STRING")})`),
  operator_length: (b, g) => numEx(`${g.str(b, "STRING")}.length`),
  operator_contains: (b, g) => boolEx(`contains(${g.any(b, "STRING1")}, ${g.any(b, "STRING2")})`),
  operator_round: (b, g) => numEx(`Math.round(${g.num(b, "NUM")})`),
  operator_mathop: (b, g) => numEx(`mathop(${JSON.stringify(g.field(b, "OPERATOR").toLowerCase())}, ${g.num(b, "NUM")})`),
};

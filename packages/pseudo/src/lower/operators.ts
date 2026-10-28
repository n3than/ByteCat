import type { Expr } from "../ast.js";
import type { SourcePos } from "../errors.js";
import type { TargetBuilder } from "../lower.js";
import type { Value } from "./types.js";

/** Lowers `not x` and unary minus (`-x` is `0 - x`). */
export function unary(b: TargetBuilder, expr: Extract<Expr, { kind: "unary" }>, parent: string): Value {
  if (expr.op === "not") {
    const id = b.block("operator_not", parent, expr.pos);
    b.boolInput(id, "OPERAND", expr.operand);
    return { kind: "block", id, bool: true };
  }
  return binary(b, { kind: "binary", op: "-", left: { kind: "number", value: "0", pos: expr.pos }, right: expr.operand, pos: expr.pos }, parent);
}

/** Lowers `join(a, b, ...)`. */
export function join(b: TargetBuilder, args: Expr[], parent: string, pos: SourcePos): Value {
  if (args.length < 2) throw b.error("join() takes at least 2 arguments", pos);
  // join(a, b, c) => join(a, join(b, c))
  const id = b.block("operator_join", parent, pos);
  b.valueInput(id, "STRING1", 10, "apple ", args[0]!);
  if (args.length === 2) b.valueInput(id, "STRING2", 10, "banana", args[1]!);
  else b.get(id).inputs.STRING2 = [3, (join(b, args.slice(1), id, pos) as { id: string }).id, [10, "banana"]];
  return { kind: "block", id, bool: false };
}

/** Lowers arithmetic, comparison and `and` / `or`. */
export function binary(b: TargetBuilder, expr: Extract<Expr, { kind: "binary" }>, parent: string): Value {
  const arith: Record<string, string> = { "+": "operator_add", "-": "operator_subtract", "*": "operator_multiply", "/": "operator_divide", "%": "operator_mod" };
  const opcode = arith[expr.op];
  if (opcode) {
    const id = b.block(opcode, parent, expr.pos);
    b.valueInput(id, "NUM1", 4, "", expr.left);
    b.valueInput(id, "NUM2", 4, "", expr.right);
    return { kind: "block", id, bool: false };
  }
  if (expr.op === "and" || expr.op === "or") {
    const id = b.block(expr.op === "and" ? "operator_and" : "operator_or", parent, expr.pos);
    b.boolInput(id, "OPERAND1", expr.left);
    b.boolInput(id, "OPERAND2", expr.right);
    return { kind: "block", id, bool: true };
  }
  // a != b => not (a = b), a <= b => not (a > b), a >= b => not (a < b)
  const negated: Record<string, "=" | ">" | "<"> = { "!=": "=", "<=": ">", ">=": "<" };
  const inner = negated[expr.op];
  if (inner) {
    const id = b.block("operator_not", parent, expr.pos);
    b.boolInput(id, "OPERAND", { ...expr, op: inner });
    return { kind: "block", id, bool: true };
  }
  const cmp: Record<string, string> = { "<": "operator_lt", ">": "operator_gt", "=": "operator_equals" };
  const id = b.block(cmp[expr.op]!, parent, expr.pos);
  b.valueInput(id, "OPERAND1", 10, "", expr.left);
  b.valueInput(id, "OPERAND2", 10, "50", expr.right);
  return { kind: "block", id, bool: true };
}

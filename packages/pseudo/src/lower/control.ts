import type { Expr, Stmt } from "../ast.js";
import type { TargetBuilder } from "../lower.js";
import { assign } from "./data.js";

export type ControlStmt = Extract<Stmt, { kind: "if" | "repeat" | "forever" | "allAtOnce" | "until" | "while" | "for" }>;

/** Lowers a control-flow statement. Returns [first, last] block ids. */
export function controlStatement(b: TargetBuilder, stmt: ControlStmt, parent: string): [string, string] {
  switch (stmt.kind) {
    case "if": {
      const id = b.block(stmt.else ? "control_if_else" : "control_if", parent, stmt.pos);
      b.boolInput(id, "CONDITION", stmt.cond);
      substack(b, id, "SUBSTACK", stmt.then);
      if (stmt.else) substack(b, id, "SUBSTACK2", stmt.else);
      return [id, id];
    }
    case "repeat": {
      const id = b.block("control_repeat", parent, stmt.pos);
      b.valueInput(id, "TIMES", 6, "10", stmt.count);
      substack(b, id, "SUBSTACK", stmt.body);
      return [id, id];
    }
    case "forever": {
      const id = b.block("control_forever", parent, stmt.pos);
      substack(b, id, "SUBSTACK", stmt.body);
      return [id, id];
    }
    case "allAtOnce": {
      const id = b.block("control_all_at_once", parent, stmt.pos);
      substack(b, id, "SUBSTACK", stmt.body);
      return [id, id];
    }
    case "until":
    case "while": {
      const id = b.block("control_repeat_until", parent, stmt.pos);
      const cond: Expr = stmt.kind === "while" ? { kind: "unary", op: "not", operand: stmt.cond, pos: stmt.pos } : stmt.cond;
      b.boolInput(id, "CONDITION", cond);
      substack(b, id, "SUBSTACK", stmt.body);
      return [id, id];
    }
    case "for": {
      // for i = a to b:  =>  i = a; repeat until i > b: body; i += 1
      const v: Expr = { kind: "name", name: stmt.variable, pos: stmt.pos };
      const [init] = assign(b, { kind: "assign", target: stmt.variable, op: "=", value: stmt.from, pos: stmt.pos }, parent);
      const loop = b.block("control_repeat_until", init, stmt.pos);
      b.get(init).next = loop;
      b.boolInput(loop, "CONDITION", { kind: "binary", op: ">", left: v, right: stmt.to, pos: stmt.pos });
      const step: Stmt = { kind: "assign", target: stmt.variable, op: "+=", value: { kind: "number", value: "1", pos: stmt.pos }, pos: stmt.pos };
      substack(b, loop, "SUBSTACK", [...stmt.body, step]);
      return [init, loop];
    }
  }
}

function substack(b: TargetBuilder, id: string, input: string, body: Stmt[]): void {
  const first = b.statements(body, id);
  if (first) b.get(id).inputs[input] = [2, first];
}

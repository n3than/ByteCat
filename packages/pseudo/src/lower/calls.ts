// Calls of builtin functions (motion, looks, sensing, events, control, ...): the builtin tables in
// ../builtins.ts say which block and slots each one uses, so one table-driven lowering covers every
// category. `log` and calls of user-defined procedures are routed from here too.
import type { Expr, Stmt } from "../ast.js";
import { REPORTERS, STATEMENTS, type Builtin, type Slot } from "../builtins.js";
import type { SourcePos } from "../errors.js";
import type { TargetBuilder } from "../lower.js";
import { join } from "./operators.js";
import { callProcedure } from "./procedures.js";
import type { Value } from "./types.js";

/** Lowers a call used as a statement. Returns [first, last] block ids. */
export function callStatement(b: TargetBuilder, stmt: Extract<Stmt, { kind: "call" }>, parent: string): [string, string] {
  if (stmt.callee === "log") {
    if (stmt.args.length !== 1) throw b.error(`log() takes 1 argument, got ${stmt.args.length}`, stmt.pos);
    const id = b.block("data_addtolist", parent, stmt.pos);
    const l = b.scope.logList();
    b.get(id).fields.LIST = [l.name, l.id];
    b.valueInput(id, "ITEM", 10, "", stmt.args[0]!);
    return [id, id];
  }
  const proc = b.procedures.get(stmt.callee);
  if (proc) return callProcedure(b, proc, stmt, parent);
  if (REPORTERS[stmt.callee]) {
    throw b.error(`${stmt.callee}() is a reporter and cannot be used as a statement`, stmt.pos);
  }
  const builtin = pickOverload(b, STATEMENTS, stmt.callee, stmt.args.length, stmt.pos, "function");
  const id = b.block(builtin.opcode, parent, stmt.pos);
  applyBuiltin(b, id, builtin, stmt.args, stmt.pos);
  if (builtin.opcode === "control_stop") {
    const option = b.get(id).fields.STOP_OPTION![0];
    b.get(id).mutation = { tagName: "mutation", children: [], hasnext: String(option === "other scripts in sprite") };
  }
  return [id, id];
}

/** Lowers a call used as a value: `join` or a builtin reporter. */
export function callReporter(b: TargetBuilder, expr: Extract<Expr, { kind: "call" }>, parent: string): Value {
  if (b.procedures.has(expr.callee)) {
    throw b.error(`${expr.callee}() is a procedure and returns nothing. Store results in a variable instead`, expr.pos);
  }
  if (expr.callee === "join") return join(b, expr.args, parent, expr.pos);
  if (STATEMENTS[expr.callee] || expr.callee === "log") {
    throw b.error(`${expr.callee}() is a statement and cannot be used as a value`, expr.pos);
  }
  const builtin = pickOverload(b, REPORTERS, expr.callee, expr.args.length, expr.pos, "reporter");
  const id = b.block(builtin.opcode, parent, expr.pos);
  applyBuiltin(b, id, builtin, expr.args, expr.pos);
  return { kind: "block", id, bool: builtin.returns === "bool" };
}

function pickOverload(b: TargetBuilder, table: Record<string, Builtin[]>, name: string, arity: number, pos: SourcePos, what: string): Builtin {
  const overloads = table[name];
  if (!overloads) {
    const hint = suggest(name, [...Object.keys(table), ...(what === "function" ? [...b.procedures.keys(), "log"] : [])]);
    throw b.error(`unknown ${what} '${name}'${hint ? `. Did you mean '${hint}'?` : ""}`, pos);
  }
  const found = overloads.find((o) => o.slots.length === arity);
  if (!found) {
    const counts = overloads.map((o) => o.slots.length).join(" or ");
    throw b.error(`${name}() takes ${counts} argument(s), got ${arity}`, pos);
  }
  if (found.spriteOnly && b.isStage) throw b.error(`${name}() is only available in sprites, not the stage`, pos);
  return found;
}

function applyBuiltin(b: TargetBuilder, id: string, builtin: Builtin, args: Expr[], pos: SourcePos): void {
  for (const [field, value] of Object.entries(builtin.fixed ?? {})) b.get(id).fields[field] = [value, null];
  builtin.slots.forEach((slot, i) => lowerSlot(b, id, slot, args[i]!, pos));
  for (const slot of builtin.implicit ?? []) {
    if (slot.kind === "menu") lowerSlot(b, id, slot, { kind: "string", value: slot.default, pos }, pos);
  }
}

function lowerSlot(b: TargetBuilder, id: string, slot: Slot, arg: Expr, pos: SourcePos): void {
  switch (slot.kind) {
    case "value":
      b.valueInput(id, slot.input, slot.prim, slot.default ?? "", arg);
      return;
    case "bool":
      b.boolInput(id, slot.input, arg);
      return;
    case "field": {
      if (arg.kind !== "string" || !slot.values.includes(arg.value)) {
        throw b.error(`expected one of ${slot.values.map((v) => `"${v}"`).join(", ")}`, arg.pos ?? pos);
      }
      b.get(id).fields[slot.field] = [arg.value, null];
      return;
    }
    case "menu": {
      const literal = arg.kind === "string" || arg.kind === "number" ? arg.value : null;
      if (literal !== null && slot.shadow === "looks_costume" && !b.costumes.some((c) => c.costume.name === literal)) {
        throw b.error(`unknown costume "${literal}"`, arg.pos);
      }
      const menu = b.block(slot.shadow, id, null, { shadow: true });
      b.get(menu).fields[slot.field] = [literal ?? slot.default, null];
      if (literal !== null) b.get(id).inputs[slot.input] = [1, menu];
      else b.get(id).inputs[slot.input] = [3, b.reporterBlock(arg, id), menu];
      return;
    }
    case "broadcast": {
      if (arg.kind === "string") {
        const msg = b.scope.broadcast(arg.value);
        b.get(id).inputs[slot.input] = [1, [11, msg.name, msg.id]];
      } else {
        const fallback = b.scope.broadcast("message1");
        b.get(id).inputs[slot.input] = [3, b.reporterBlock(arg, id), [11, fallback.name, fallback.id]];
      }
      return;
    }
  }
}

/** Closest name by edit distance, for "did you mean" hints. */
function suggest(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestScore) {
      best = c;
      bestScore = d;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

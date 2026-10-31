import type { Expr, Stmt } from "../ast.js";
import type { SourcePos } from "../errors.js";
import type { TargetBuilder } from "../lower.js";
import type { Value } from "./types.js";

/** Lowers `x = e`, `x += e` and the other assignment forms. Returns [first, last] block ids. */
export function assign(b: TargetBuilder, stmt: Extract<Stmt, { kind: "assign" }>, parent: string): [string, string] {
  const v = b.variable(stmt.target, stmt.pos);
  let opcode = "data_setvariableto";
  let value = stmt.value;
  if (stmt.op === "+=") opcode = "data_changevariableby";
  else if (stmt.op === "-=") {
    opcode = "data_changevariableby";
    value = value.kind === "number"
      ? { ...value, value: value.value.startsWith("-") ? value.value.slice(1) : "-" + value.value }
      : { kind: "unary", op: "-", operand: value, pos: value.pos };
  } else if (stmt.op === "*=" || stmt.op === "/=") {
    value = { kind: "binary", op: stmt.op[0] as "*" | "/", left: { kind: "name", name: stmt.target, pos: stmt.pos }, right: value, pos: stmt.pos };
  }
  const id = b.block(opcode, parent, stmt.pos);
  b.get(id).fields.VARIABLE = [v.name, v.id];
  if (opcode === "data_setvariableto") b.valueInput(id, "VALUE", 10, "0", value);
  else b.valueInput(id, "VALUE", 4, "1", value);
  return [id, id];
}

/** Lowers `list[i] = e`. */
export function setItem(b: TargetBuilder, stmt: Extract<Stmt, { kind: "setItem" }>, parent: string): [string, string] {
  const id = b.block("data_replaceitemoflist", parent, stmt.pos);
  listField(b, id, stmt.list, stmt.pos);
  b.valueInput(id, "INDEX", 7, "1", stmt.index);
  b.valueInput(id, "ITEM", 10, "thing", stmt.value);
  return [id, id];
}

/** Lowers `list.add(x)`, `.insert`, `.delete`, `.clear`, `.show` and `.hide`. */
export function listMethod(b: TargetBuilder, stmt: Extract<Stmt, { kind: "method" }>, parent: string): [string, string] {
  const spec: Record<string, { opcode: string; args: [string, 7 | 10, string][] }> = {
    add: { opcode: "data_addtolist", args: [["ITEM", 10, "thing"]] },
    insert: { opcode: "data_insertatlist", args: [["INDEX", 7, "1"], ["ITEM", 10, "thing"]] },
    delete: { opcode: "data_deleteoflist", args: [["INDEX", 7, "1"]] },
    clear: { opcode: "data_deletealloflist", args: [] },
    show: { opcode: "data_showlist", args: [] },
    hide: { opcode: "data_hidelist", args: [] },
  };
  const m = spec[stmt.method];
  if (!m) throw b.error(`unknown list method '${stmt.method}', expected add, insert, delete, clear, show or hide`, stmt.pos);
  if (stmt.args.length !== m.args.length) {
    throw b.error(`${stmt.object}.${stmt.method}() takes ${m.args.length} argument(s), got ${stmt.args.length}`, stmt.pos);
  }
  const id = b.block(m.opcode, parent, stmt.pos);
  listField(b, id, stmt.object, stmt.pos);
  m.args.forEach(([input, prim, def], i) => b.valueInput(id, input, prim, def, stmt.args[i]!));
  return [id, id];
}

/** Sets the LIST field of block `id` to the list called `name`. */
export function listField(b: TargetBuilder, id: string, name: string, pos: SourcePos): void {
  const l = b.list(name, pos);
  b.get(id).fields.LIST = [l.name, l.id];
}

/** Lowers `list[i]`. */
export function itemOf(b: TargetBuilder, expr: Extract<Expr, { kind: "index" }>, parent: string): Value {
  const id = b.block("data_itemoflist", parent, expr.pos);
  listField(b, id, expr.list, expr.pos);
  b.valueInput(id, "INDEX", 7, "1", expr.index);
  return { kind: "block", id, bool: false };
}

/** Lowers `list.length`, `list.contains(x)` and `list.index_of(x)`. */
export function listMember(b: TargetBuilder, expr: Extract<Expr, { kind: "member" }>, parent: string): Value {
  const spec: Record<string, { opcode: string; args: number; bool: boolean; call: boolean }> = {
    length: { opcode: "data_lengthoflist", args: 0, bool: false, call: false },
    contains: { opcode: "data_listcontainsitem", args: 1, bool: true, call: true },
    index_of: { opcode: "data_itemnumoflist", args: 1, bool: false, call: true },
  };
  const m = spec[expr.member];
  if (!m) throw b.error(`unknown list property '${expr.member}', expected length, contains() or index_of()`, expr.pos);
  if (m.call !== (expr.args !== null)) {
    throw b.error(m.call ? `${expr.member} is a method, call it: ${expr.object}.${expr.member}(x)` : `${expr.member} is a property, write ${expr.object}.${expr.member} without parentheses`, expr.pos);
  }
  if ((expr.args?.length ?? 0) !== m.args) throw b.error(`${expr.object}.${expr.member}() takes ${m.args} argument(s)`, expr.pos);
  const id = b.block(m.opcode, parent, expr.pos);
  listField(b, id, expr.object, expr.pos);
  if (m.args === 1) b.valueInput(id, "ITEM", 10, "thing", expr.args![0]!);
  return { kind: "block", id, bool: m.bool };
}

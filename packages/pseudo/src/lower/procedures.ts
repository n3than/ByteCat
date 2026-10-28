import type { ScriptNode, Stmt } from "../ast.js";
import { REPORTERS, STATEMENTS } from "../builtins.js";
import type { TargetBuilder } from "../lower.js";
import type { Procedure } from "./types.js";

/** Registers a `define` so calls can come before the definition. */
export function registerProcedure(b: TargetBuilder, def: Extract<ScriptNode, { kind: "define" }>): void {
  if (b.procedures.has(def.name)) throw b.error(`procedure '${def.name}' is already defined`, def.pos);
  if (STATEMENTS[def.name] || REPORTERS[def.name] || def.name === "log") {
    throw b.error(`'${def.name}' is a builtin and cannot be redefined`, def.pos);
  }
  b.procedures.set(def.name, {
    name: def.name,
    proccode: [def.name, ...def.params.map((p) => (p.boolean ? "%b" : "%s"))].join(" "),
    argumentIds: def.params.map(() => b.scope.ids.id("arg")),
    params: def.params,
    warp: def.warp,
  });
}

/** Lowers the definition hat with its prototype and arguments, and makes the parameters visible to the body. */
export function defineHat(b: TargetBuilder, script: Extract<ScriptNode, { kind: "define" }>): string {
  const proc = b.procedures.get(script.name)!;
  const hat = b.block("procedures_definition", null, script.pos);
  const proto = b.block("procedures_prototype", hat, null, { shadow: true });
  b.get(hat).inputs.custom_block = [1, proto];
  proc.params.forEach((p, i) => {
    const arg = b.block(p.boolean ? "argument_reporter_boolean" : "argument_reporter_string_number", proto, null, { shadow: true });
    b.get(arg).fields.VALUE = [p.name, null];
    b.get(proto).inputs[proc.argumentIds[i]!] = [1, arg];
  });
  b.get(proto).mutation = {
    tagName: "mutation",
    children: [],
    proccode: proc.proccode,
    argumentids: JSON.stringify(proc.argumentIds),
    argumentnames: JSON.stringify(proc.params.map((p) => p.name)),
    argumentdefaults: JSON.stringify(proc.params.map((p) => (p.boolean ? "false" : ""))),
    warp: String(proc.warp),
  };
  b.params = proc.params;
  return hat;
}

/** Lowers a call to a user-defined procedure. */
export function callProcedure(b: TargetBuilder, proc: Procedure, stmt: Extract<Stmt, { kind: "call" }>, parent: string): [string, string] {
  if (stmt.args.length !== proc.params.length) {
    throw b.error(`${proc.name}() takes ${proc.params.length} argument(s), got ${stmt.args.length}`, stmt.pos);
  }
  const id = b.block("procedures_call", parent, stmt.pos);
  b.get(id).mutation = {
    tagName: "mutation",
    children: [],
    proccode: proc.proccode,
    argumentids: JSON.stringify(proc.argumentIds),
    warp: String(proc.warp),
  };
  proc.params.forEach((p, i) => {
    if (p.boolean) b.boolInput(id, proc.argumentIds[i]!, stmt.args[i]!);
    else b.valueInput(id, proc.argumentIds[i]!, 10, "", stmt.args[i]!);
  });
  return [id, id];
}

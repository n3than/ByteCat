import type { Block, Target } from "@bytecat/sb3";
import { builtins } from "../extensions/index.js";
import type { ExtensionRegistry } from "../extensions/registry.js";
import type { Proc } from "../types.js";
import { stackYields } from "./yields.js";

export interface ProcedureTable {
  /** Custom blocks by proccode. */
  procs: Map<string, Proc>;
  /** Each procedure with its `procedures_definition` block, in block order. */
  defs: { proc: Proc; proccode: string; definition: Block }[];
}

/**
 * Finds the custom blocks a target defines. Every procedure starts out sync, and is a reporter
 * when a call to it sits in an input of another block.
 */
export function collectProcedures(target: Target, index: number, registry: ExtensionRegistry = builtins): ProcedureTable {
  const procs = new Map<string, Proc>();
  let n = 0;
  for (const block of Object.values(target.blocks)) {
    if (block.opcode !== "procedures_prototype" || !block.mutation?.proccode) continue;
    const names = JSON.parse(block.mutation.argumentnames ?? "[]") as string[];
    if (procs.has(block.mutation.proccode)) continue;
    procs.set(block.mutation.proccode, {
      fn: `p${index}_${n++}`,
      params: names,
      warp: block.mutation.warp === "true" || (block.mutation.warp as unknown) === true,
      sync: true,
      reporter: false,
    });
  }
  for (const block of Object.values(target.blocks)) {
    const substacks = registry.statement(block.opcode)?.substacks ?? [];
    for (const [name, input] of Object.entries(block.inputs)) {
      if (substacks.includes(name)) continue;
      const v = input[1];
      const call = typeof v === "string" ? target.blocks[v] : undefined;
      const proc = call?.opcode === "procedures_call" ? procs.get(call.mutation?.proccode ?? "") : undefined;
      if (proc) proc.reporter = true;
    }
  }
  const defs: ProcedureTable["defs"] = [];
  for (const block of Object.values(target.blocks)) {
    if (block.opcode !== "procedures_definition") continue;
    const protoId = block.inputs.custom_block?.[1];
    const proto = typeof protoId === "string" ? target.blocks[protoId] : undefined;
    const proccode = proto?.mutation?.proccode;
    const proc = proccode ? procs.get(proccode) : undefined;
    if (proc && proccode) defs.push({ proc, proccode, definition: block });
  }
  return { procs, defs };
}

/**
 * Settles which procedures are sync, meaning their body can never yield, so they compile to
 * plain functions. A body that can yield makes its procedure a generator, which can make its
 * callers generators too, so this repeats until nothing changes. Sets `proc.sync` in place.
 */
export function analyzeSync(target: Target, table: ProcedureTable, registry: ExtensionRegistry): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const { proc, proccode, definition } of table.defs) {
      if (!proc.sync) continue;
      const ctx = { blocks: target.blocks, procs: table.procs, warp: proc.warp, proccode, registry };
      if (stackYields(ctx, definition.next)) {
        proc.sync = false;
        changed = true;
      }
    }
  }
}

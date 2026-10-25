import type { Block, Target } from "@bytecat/sb3";
import type { Proc } from "../types.js";
import { stackYields } from "./yields.js";

export interface ProcedureTable {
  /** Custom blocks by proccode. */
  procs: Map<string, Proc>;
  /** Each procedure with its `procedures_definition` block, in block order. */
  defs: { proc: Proc; definition: Block }[];
}

/** Finds the custom blocks a target defines. Every procedure starts out sync. */
export function collectProcedures(target: Target, index: number): ProcedureTable {
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
    });
  }
  const defs: ProcedureTable["defs"] = [];
  for (const block of Object.values(target.blocks)) {
    if (block.opcode !== "procedures_definition") continue;
    const protoId = block.inputs.custom_block?.[1];
    const proto = typeof protoId === "string" ? target.blocks[protoId] : undefined;
    const proc = proto?.mutation?.proccode ? procs.get(proto.mutation.proccode) : undefined;
    if (proc) defs.push({ proc, definition: block });
  }
  return { procs, defs };
}

/**
 * Settles which procedures are sync, meaning their body can never yield, so they compile to
 * plain functions. A body that can yield makes its procedure a generator, which can make its
 * callers generators too, so this repeats until nothing changes. Sets `proc.sync` in place.
 */
export function analyzeSync(target: Target, table: ProcedureTable): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const { proc, definition } of table.defs) {
      if (!proc.sync) continue;
      const ctx = { blocks: target.blocks, procs: table.procs, warp: proc.warp };
      if (stackYields(ctx, definition.next)) {
        proc.sync = false;
        changed = true;
      }
    }
  }
}

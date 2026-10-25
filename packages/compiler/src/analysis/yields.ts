import type { Block } from "@bytecat/sb3";
import type { Proc } from "../types.js";

/** Statements that can wait for a later frame whatever they are given. */
export const YIELDING_STATEMENTS: ReadonlySet<string> = new Set([
  "motion_glidesecstoxy",
  "looks_sayforsecs",
  "looks_thinkforsecs",
  "event_broadcastandwait",
  "control_wait",
  "control_wait_until",
  "sensing_askandwait",
]);

/** Loops, which yield at the end of every iteration unless the script is in warp mode. */
export const LOOPS: ReadonlySet<string> = new Set([
  "control_repeat",
  "control_forever",
  "control_repeat_until",
  "control_while",
  "control_for_each",
]);

/** The substack inputs each statement runs, for the statements that nest others. */
export const SUBSTACKS: Readonly<Record<string, readonly string[]>> = {
  control_repeat: ["SUBSTACK"],
  control_forever: ["SUBSTACK"],
  control_repeat_until: ["SUBSTACK"],
  control_while: ["SUBSTACK"],
  control_for_each: ["SUBSTACK"],
  control_if: ["SUBSTACK"],
  control_if_else: ["SUBSTACK", "SUBSTACK2"],
};

export interface YieldContext {
  blocks: Record<string, Block>;
  /** Custom blocks by proccode, with their current `sync` verdict. */
  procs: ReadonlyMap<string, Proc>;
  /** True inside a warp procedure, where loops never yield. */
  warp: boolean;
}

/**
 * True when compiling the stack that starts at `id` produces code that can yield: a waiting
 * statement, a loop outside warp mode, or a call to a procedure not (yet) known to be sync.
 * It follows the same blocks the code generator does: the `next` chain and the substacks of
 * the statements in `SUBSTACKS`.
 */
export function stackYields(ctx: YieldContext, id: string | null | undefined): boolean {
  while (id) {
    const b = ctx.blocks[id];
    if (!b) return false;
    if (statementYields(ctx, b)) return true;
    id = b.next;
  }
  return false;
}

function statementYields(ctx: YieldContext, b: Block): boolean {
  if (YIELDING_STATEMENTS.has(b.opcode)) return true;
  if (LOOPS.has(b.opcode) && !ctx.warp) return true;
  if (b.opcode === "procedures_call") {
    const proc = b.mutation?.proccode ? ctx.procs.get(b.mutation.proccode) : undefined;
    return proc !== undefined && !proc.sync;
  }
  for (const name of Object.hasOwn(SUBSTACKS, b.opcode) ? SUBSTACKS[b.opcode]! : []) {
    const v = b.inputs[name]?.[1];
    if (typeof v === "string" && stackYields(ctx, v)) return true;
  }
  return false;
}

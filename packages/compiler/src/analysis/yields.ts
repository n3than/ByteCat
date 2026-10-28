import type { Block } from "@bytecat/sb3";
import type { ExtensionRegistry } from "../extensions/registry.js";
import type { Proc } from "../types.js";

export interface YieldContext {
  blocks: Record<string, Block>;
  /** Custom blocks by proccode, with their current `sync` verdict. */
  procs: ReadonlyMap<string, Proc>;
  /** True inside a warp procedure, where loops never yield. */
  warp: boolean;
  /** Proccode of the procedure being analysed; undefined in a hat script. */
  proccode?: string | undefined;
  /** Where each statement says whether it yields (`StatementSpec.yields`) and what it nests. */
  registry: ExtensionRegistry;
}

/**
 * True when compiling the stack that starts at `id` produces code that can yield: a waiting
 * statement, a loop outside warp mode, or a statement whose own rule says so (a call to a
 * procedure not yet known to be sync). It follows the same blocks the code generator does: the
 * `next` chain and the substacks each statement declares. A test checks every handler against
 * its declaration, so the two cannot drift.
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
  const spec = ctx.registry.statement(b.opcode);
  if (!spec?.compile) return false;
  const { yields } = spec;
  if (yields === "wait") return true;
  if (yields === "loop" && !ctx.warp) return true;
  if (typeof yields === "function" && yields(b, ctx)) return true;
  for (const name of spec.substacks ?? []) {
    const v = b.inputs[name]?.[1];
    if (typeof v === "string" && stackYields(ctx, v)) return true;
  }
  return false;
}

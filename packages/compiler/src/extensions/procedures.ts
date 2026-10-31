import type { Block } from "@bytecat/sb3";
import { asAny, lit } from "../cast.js";
import type { Gen, Proc } from "../types.js";
import { statement, type Extension, type HatSpec } from "./api.js";

const definition: HatSpec = { kind: "hat", status: "compiled", definesProcedure: true };

/** The arguments of a call, cast for passing on, after recording their types. */
function callArgs(b: Block, g: Gen, proc: Proc): string {
  const ids = JSON.parse(b.mutation?.argumentids ?? "[]") as string[];
  const inputs = ids.map((id) => g.input(b, id));
  g.noteCall(proc, inputs.map((e) => e.t));
  return ["t", "th", ...inputs.map(asAny)].join(", ");
}

export const procedures: Extension = {
  id: "procedures",
  name: "My Blocks",
  runtime: "@bytecat/runtime/control",
  blocks: {
    // Its body compiles to a function (`TargetCodegen.procedures`), not to a hat script.
    procedures_definition: definition,
    procedures_call: statement(
      (b, g) => {
        const proc = g.proc(b.mutation?.proccode);
        if (!proc) return [];
        const call = `${proc.fn}(${callArgs(b, g, proc)});`;
        // Like scratch-vm and TurboWarp, a direct recursive call outside warp mode yields first. A
        // warp caller further up the stack (th.warp > 0) still skips the yield.
        const recursive = proc === g.procedure && !proc.warp;
        const lead = recursive ? g.y("if (th.warp === 0) yield;") : [];
        // A sync procedure never reads th.warp, so it needs no warp bookkeeping.
        if (proc.sync) return [g.store(proc), call, g.load(proc)];
        g.markYields();
        if (!proc.warp) return [...lead, g.store(), `yield* ${call}`, g.load()];
        return ["th.warp++;", g.store(), `try { yield* ${call} } finally { th.warp--; }`, g.load()];
      },
      {
        // A call yields when the callee is not (yet) known to be sync, and, like scratch-vm and
        // TurboWarp, when it calls its own procedure directly outside warp mode.
        yields: (b, ctx) => {
          const proccode = b.mutation?.proccode;
          if (!ctx.warp && proccode === ctx.proccode) return true;
          const proc = proccode ? ctx.procs.get(proccode) : undefined;
          return proc !== undefined && !proc.sync;
        },
        // In an input, a call is TurboWarp's custom reporter: it reports what the callee returns.
        // A sync callee is a plain function call; any other is a generator run with `yield*`.
        // Like TurboWarp, a direct recursive call outside warp mode evaluates its arguments, then
        // yields, then calls (`yieldThenCall`), and a call to a warp procedure runs in warp mode
        // (`callInWarp`). A call to a procedure the target does not define reports "".
        reporter: (b, g) => {
          const proc = g.proc(b.mutation?.proccode);
          if (!proc) return lit("");
          const call = `${proc.fn}(${callArgs(b, g, proc)})`;
          const t = g.returnType(proc);
          if (proc.sync) return { c: g.callExpr(call, proc), t };
          g.markYields();
          const recursive = proc === g.procedure && !proc.warp;
          const run = recursive ? `yieldThenCall(th, ${call})` : proc.warp ? `callInWarp(th, ${call})` : call;
          return { c: g.callExpr(`(yield* ${run})`, proc), t };
        },
        uses: ["yieldThenCall", "callInWarp"],
      },
    ),
    // TurboWarp's `return` block: leaves a custom block with a value, which a call in an input
    // reports. In a hat script it stops the script.
    procedures_return: statement(
      (b, g) => {
        if (!g.procedure) return [g.store(), "return;"];
        const value = g.input(b, "VALUE");
        g.noteReturn(value.t);
        return [g.store(), `return ${asAny(value)};`];
      },
      { hidden: true },
    ),
  },
};

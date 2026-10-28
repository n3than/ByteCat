import { asAny } from "../cast.js";
import { missing, statement, type Extension, type HatSpec } from "./api.js";

const definition: HatSpec = { kind: "hat", status: "compiled", definesProcedure: true };

export const procedures: Extension = {
  id: "procedures",
  name: "My Blocks",
  blocks: {
    // Its body compiles to a function (`TargetCodegen.procedures`), not to a hat script.
    procedures_definition: definition,
    procedures_call: statement(
      (b, g) => {
        const proc = g.proc(b.mutation?.proccode);
        if (!proc) return [];
        const ids = JSON.parse(b.mutation?.argumentids ?? "[]") as string[];
        const inputs = ids.map((id) => g.input(b, id));
        g.noteCall(proc, inputs.map((e) => e.t));
        const args = inputs.map(asAny);
        const call = `${proc.fn}(${["t", "th", ...args].join(", ")});`;
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
      },
    ),
    procedures_return: missing("statement", "TurboWarp custom reporters; calls become expressions that may yield", { hidden: true }),
  },
};

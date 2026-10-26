import type { ReporterHandler, StatementHandler } from "../types.js";
import { BOOL } from "../analysis/typeset.js";
import { anyEx, asAny, lit } from "../cast.js";

export const procedureStatements: Record<string, StatementHandler> = {
  procedures_call: (b, g) => {
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
};

export const procedureReporters: Record<string, ReporterHandler> = {
  argument_reporter_string_number: (b, g) => {
    const name = g.field(b, "VALUE");
    const p = g.param(name);
    return p ? anyEx(p, g.paramType(name)) : lit("0");
  },
  argument_reporter_boolean: (b, g) => {
    const name = g.field(b, "VALUE");
    const p = g.param(name);
    return p ? anyEx(p, g.paramType(name)) : { c: "false", t: BOOL };
  },
};

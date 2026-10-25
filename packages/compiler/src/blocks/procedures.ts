import type { ReporterHandler, StatementHandler } from "../types.js";
import { anyEx, lit } from "../cast.js";

export const procedureStatements: Record<string, StatementHandler> = {
  procedures_call: (b, g) => {
    const proc = g.proc(b.mutation?.proccode);
    if (!proc) return [];
    const ids = JSON.parse(b.mutation?.argumentids ?? "[]") as string[];
    const args = ids.map((id) => g.any(b, id));
    const call = `${proc.fn}(${["t", "th", ...args].join(", ")});`;
    // A sync procedure never reads th.warp, so it needs no warp bookkeeping.
    if (proc.sync) return [call];
    g.markYields();
    if (!proc.warp) return [`yield* ${call}`];
    return ["th.warp++;", `try { yield* ${call} } finally { th.warp--; }`];
  },
};

export const procedureReporters: Record<string, ReporterHandler> = {
  argument_reporter_string_number: (b, g) => {
    const p = g.param(g.field(b, "VALUE"));
    return p ? anyEx(p) : lit("0");
  },
  argument_reporter_boolean: (b, g) => {
    const p = g.param(g.field(b, "VALUE"));
    return p ? anyEx(p) : { c: "false", t: "bool" };
  },
};

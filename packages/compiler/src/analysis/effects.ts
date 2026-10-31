import type { Block, InputValue } from "@bytecat/sb3";
import type { FieldRef } from "../types.js";
import type { ProcedureTable } from "./procedures.js";

/** What running a custom block can do to variables, counting every custom block it calls. */
export interface Effects {
  /** Variables it may read, as storage references (`S.v["id"]`, `t.v["id"]`). */
  reads: Set<string>;
  /** Variables it may assign. */
  writes: Set<string>;
  /**
   * True when it may run `stop all` or `delete this clone`, which end scripts that never store
   * their locals again, or `create clone`, which copies every variable of its target: a caller
   * stores all its locals before the call.
   */
  stops: boolean;
}

/** Statements that assign the variable in their VARIABLE field. */
const ASSIGNS: ReadonlySet<string> = new Set(["data_setvariableto", "data_changevariableby", "control_for_each"]);
/** Blocks that read the variable in their VARIABLE field. */
const READS: ReadonlySet<string> = new Set(["data_variable", "data_changevariableby"]);
/** Blocks that see every variable or end the script, besides `stop all` (see `Effects.stops`). */
const STOPS: ReadonlySet<string> = new Set(["control_create_clone_of", "control_delete_this_clone"]);

/**
 * The effects of every procedure of a target, by proccode. A caller that keeps variables in
 * JavaScript locals uses them to know which ones to store before a call and load after it.
 * The analysis visits every block reachable from a definition through `next` and any input, which
 * covers at least the blocks the code generator compiles. Calls make it repeat until nothing
 * changes, so recursion is handled.
 */
export function analyzeEffects(
  blocks: Record<string, Block>,
  table: ProcedureTable,
  variable: (field: FieldRef) => string,
  /**
   * The variables `[x] of [object]` may read for a property that names a variable: every one with
   * that name the target or the stage owns. More than it reads, which only stores more locals.
   */
  named: (name: string) => string[] = () => [],
): Map<string, Effects> {
  const direct = new Map<string, Effects & { calls: Set<string> }>();
  for (const { proccode, definition } of table.defs) {
    const e = { reads: new Set<string>(), writes: new Set<string>(), stops: false, calls: new Set<string>() };
    const seen = new Set<string>();
    const visit = (id: string | null | undefined): void => {
      while (id && !seen.has(id)) {
        seen.add(id);
        const b = blocks[id];
        if (!b) return;
        if (READS.has(b.opcode)) e.reads.add(variable(b.fields.VARIABLE));
        if (ASSIGNS.has(b.opcode)) e.writes.add(variable(b.fields.VARIABLE));
        if (b.opcode === "sensing_of") for (const ref of named(String(b.fields.PROPERTY?.[0] ?? ""))) e.reads.add(ref);
        if (STOPS.has(b.opcode) || (b.opcode === "control_stop" && b.fields.STOP_OPTION?.[0] === "all")) e.stops = true;
        if (b.opcode === "procedures_call" && b.mutation?.proccode) e.calls.add(b.mutation.proccode);
        for (const input of Object.values(b.inputs)) {
          for (const v of input.slice(1) as InputValue[]) {
            if (typeof v === "string") visit(v);
            else if (Array.isArray(v) && v[0] === 12) e.reads.add(variable([v[1], v[2]]));
          }
        }
        id = b.next;
      }
    };
    visit(definition.next);
    if (!direct.has(proccode)) direct.set(proccode, e);
  }
  // Close over calls: a procedure does whatever the procedures it calls do.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of direct.values()) {
      for (const code of e.calls) {
        const callee = direct.get(code);
        if (!callee) continue;
        const before = e.reads.size + e.writes.size + Number(e.stops);
        for (const r of callee.reads) e.reads.add(r);
        for (const w of callee.writes) e.writes.add(w);
        e.stops ||= callee.stops;
        if (e.reads.size + e.writes.size + Number(e.stops) !== before) changed = true;
      }
    }
  }
  return new Map([...direct].map(([code, { reads, writes, stops }]) => [code, { reads, writes, stops }]));
}

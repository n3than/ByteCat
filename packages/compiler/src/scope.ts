import type { Target } from "@bytecat/sb3";
import type { FieldRef } from "./types.js";

/** Where a variable or list lives: the running target's own (`t`) or the stage's (`S`), by id. */
export interface Slot {
  owner: "t" | "S";
  key: string;
}

/**
 * Resolves variable and list fields to the JavaScript that reaches their storage: `t.v[id]` for a
 * sprite's own, `S.v[id]` for the stage's. Anything unknown is created on the stage at startup,
 * which `prelude` collects.
 */
export class Scope {
  constructor(
    private readonly target: Target,
    private readonly stage: Target,
    private readonly prelude: string[],
  ) {}

  variable(field: FieldRef): string {
    return ref(this.variableSlot(field), "v");
  }

  list(field: FieldRef): string {
    return ref(this.listSlot(field), "l");
  }

  listSlot(field: FieldRef): Slot {
    return this.lookup(field, "lists", "l");
  }

  variableSlot(field: FieldRef): Slot {
    return this.lookup(field, "variables", "v");
  }

  private lookup(field: FieldRef, kind: "variables" | "lists", prop: "v" | "l"): Slot {
    const [name, id] = [field?.[0] ?? "", field?.[1] ?? null];
    if (id && id in this.target[kind]) return { owner: "t", key: id };
    if (id && id in this.stage[kind]) return { owner: "S", key: id };
    // Fall back to a lookup by name, as scratch-vm does for projects with stale ids.
    for (const [owner, t] of [["t", this.target], ["S", this.stage]] as const) {
      const found = Object.entries(t[kind]).find(([, v]) => v[0] === name);
      if (found) return { owner, key: found[0] };
    }
    // Unknown: create it on the stage when the program starts.
    const key = id ?? `missing:${name}`;
    const init = kind === "lists" ? "[]" : "0";
    const line = `if (!(${JSON.stringify(key)} in S.${prop})) S.${prop}[${JSON.stringify(key)}] = ${init};`;
    if (!this.prelude.includes(line)) this.prelude.push(line);
    return { owner: "S", key };
  }
}

function ref(slot: Slot, prop: "v" | "l"): string {
  return `${slot.owner}.${prop}[${JSON.stringify(slot.key)}]`;
}

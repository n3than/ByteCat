import type { Target } from "@bytecat/sb3";
import type { FieldRef } from "./types.js";

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
    return this.lookup(field, "variables", "v");
  }

  list(field: FieldRef): string {
    return this.lookup(field, "lists", "l");
  }

  private lookup(field: FieldRef, kind: "variables" | "lists", prop: "v" | "l"): string {
    const [name, id] = [field?.[0] ?? "", field?.[1] ?? null];
    const ref = (owner: string, key: string) => `${owner}.${prop}[${JSON.stringify(key)}]`;
    if (id && id in this.target[kind]) return ref("t", id);
    if (id && id in this.stage[kind]) return ref("S", id);
    // Fall back to a lookup by name, as scratch-vm does for projects with stale ids.
    for (const [owner, t] of [["t", this.target], ["S", this.stage]] as const) {
      const found = Object.entries(t[kind]).find(([, v]) => v[0] === name);
      if (found) return ref(owner, found[0]);
    }
    // Unknown: create it on the stage when the program starts.
    const key = id ?? `missing:${name}`;
    const init = kind === "lists" ? "[]" : "0";
    const line = `if (!(${JSON.stringify(key)} in S.${prop})) S.${prop}[${JSON.stringify(key)}] = ${init};`;
    if (!this.prelude.includes(line)) this.prelude.push(line);
    return ref("S", key);
  }
}

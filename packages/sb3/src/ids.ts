/**
 * Deterministic id generator. Scratch only needs ids to be unique within a project,
 * so a counter keeps output stable across runs, which keeps diffs and snapshots readable.
 */
export class IdGen {
  private next = 0;
  constructor(private readonly prefix = "") {}

  id(hint = ""): string {
    const n = (this.next++).toString(36);
    return `${this.prefix}${hint ? hint + "_" : ""}${n}`;
  }
}

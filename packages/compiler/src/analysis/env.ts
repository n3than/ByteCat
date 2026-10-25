import type { ProjectJson } from "@bytecat/sb3";
import { ANY, typeOfValue, type TypeSet } from "./typeset.js";

/** Passes after which a type that still grows is widened to ANY, so the analysis always ends. */
const MAX_PASSES = 20;

/**
 * Whole-program types of variables, list items and custom block arguments. A variable can only
 * change through blocks the compiler sees, so its type is the union of its initial value and every
 * value assigned to it anywhere; likewise a list's items; an argument's type is the union over
 * every call. Compiling a program reads the
 * types from the previous pass and records new ones, which can widen what later code reads, so
 * the compiler repeats until a pass adds nothing (`settle`). Types only grow, so this ends.
 */
export class TypeEnv {
  private current = new Map<string, TypeSet>();
  private readonly next = new Map<string, TypeSet>();
  private passes = 0;

  constructor(project: ProjectJson) {
    project.targets.forEach((target, index) => {
      for (const [id, [, value]] of Object.entries(target.variables)) {
        this.note(TypeEnv.variableKey(index, id), typeOfValue(value));
      }
      for (const [id, [, items]] of Object.entries(target.lists)) {
        const key = TypeEnv.listKey(index, id);
        this.note(key, 0);
        for (const item of items) this.note(key, typeOfValue(item));
      }
    });
    this.current = new Map(this.next);
  }

  /** Key of the variable `id` owned by target `index` (0 is the stage). */
  static variableKey(index: number, id: string): string {
    return `v${index}:${id}`;
  }

  /** Key of the items of the list `id` owned by target `index`. */
  static listKey(index: number, id: string): string {
    return `l${index}:${id}`;
  }

  /** Key of the `i`th argument of the procedure compiled to the function `fn`. */
  static paramKey(fn: string, i: number): string {
    return `p${fn}:${i}`;
  }

  /** The type known so far. Something never recorded has the empty type: no value reaches it. */
  get(key: string): TypeSet {
    return this.current.get(key) ?? 0;
  }

  note(key: string, type: TypeSet): void {
    this.next.set(key, (this.next.get(key) ?? 0) | type);
  }

  /** Ends a pass. Returns true when a type grew, so the program must be compiled again. */
  settle(): boolean {
    this.passes++;
    let changed = false;
    for (const [key, type] of this.next) {
      if (this.current.get(key) === type) continue;
      changed = true;
      if (this.passes >= MAX_PASSES) this.next.set(key, ANY);
    }
    this.current = new Map(this.next);
    return changed;
  }
}

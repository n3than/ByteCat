import type { Block, ProjectJson, Target } from "@bytecat/sb3";
import type { Ex, Gen } from "../src/types.js";
import { ANY } from "../src/analysis/typeset.js";
import { asAny, asBool, asNum, asStr, indent, lit, menuLiteral } from "../src/cast.js";

export function block(opcode: string, extra: Partial<Block> = {}): Block {
  return { opcode, next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: false, ...extra };
}

/** A target with the given blocks and nothing else; cast because only the compiler's fields matter. */
export function target(blocks: Record<string, Block>, extra: Partial<Target> = {}): Target {
  return { isStage: false, name: "T", variables: {}, lists: {}, broadcasts: {}, blocks, ...extra } as unknown as Target;
}

export function project(...targets: Target[]): ProjectJson {
  const stage = { ...target({}), isStage: true, name: "Stage" } as Target;
  return { targets: [stage, ...targets] } as unknown as ProjectJson;
}

/** A Gen whose inputs come from a plain map, so a block handler can be tested alone. */
export function stubGen(inputs: Record<string, Ex> = {}, fields: Record<string, string> = {}): Gen & { yielded: boolean } {
  let n = 0;
  const g = {
    target: target({}),
    procedure: undefined,
    yielded: false,
    input: (_b, name) => inputs[name] ?? lit(""),
    num: (b, name) => asNum(g.input(b, name)),
    str: (b, name) => asStr(g.input(b, name)),
    bool: (b, name) => asBool(g.input(b, name)),
    any: (b, name) => asAny(g.input(b, name)),
    menu: (b, name) => {
      const e = g.input(b, name);
      return e.k !== undefined ? menuLiteral(e.k) : e;
    },
    field: (_b, name) => fields[name] ?? "",
    variable: (f) => `t.v[${JSON.stringify(f?.[1] ?? f?.[0])}]`,
    list: (f) => `t.l[${JSON.stringify(f?.[1] ?? f?.[0])}]`,
    varType: () => ANY,
    noteWrite: () => {},
    listType: () => ANY,
    noteListWrite: () => {},
    param: () => undefined,
    paramType: () => ANY,
    noteCall: () => {},
    proc: () => undefined,
    stack: () => [],
    substack: () => indent(["body;"]),
    tmp: () => `r${n++}`,
    loopYield: () => {
      g.yielded = true;
      return ["  if (th.warp === 0) yield;"];
    },
    y: (line) => {
      g.yielded = true;
      return [line];
    },
    markYields: () => {
      g.yielded = true;
    },
    store: () => "store;",
    load: () => "load;",
  } as Gen & { yielded: boolean };
  return g;
}

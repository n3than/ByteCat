import type { Block, Target } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { analyzeEffects } from "../src/analysis/effects.js";
import { analyzeSync, collectProcedures } from "../src/analysis/procedures.js";
import { stackYields } from "../src/analysis/yields.js";
import { builtins } from "../src/extensions/index.js";
import { compileProject } from "../src/index.js";
import { block, project, stubGen, target } from "./helpers.js";

type B = Record<string, Block>;
const substack = (id: string) => ({ SUBSTACK: [2, id] as [2, string] });
const call = (proccode: string, extra: Partial<Block> = {}) =>
  block("procedures_call", { mutation: { proccode, argumentids: "[]" } as never, ...extra });

/** A target with procedures; `bodies` maps proccode to the blocks of its body (first one is "start"). */
function withProcs(procs: Record<string, { warp?: boolean; blocks: B }>): Target {
  const blocks: B = {};
  for (const [code, def] of Object.entries(procs)) {
    blocks[`proto_${code}`] = block("procedures_prototype", {
      mutation: { proccode: code, argumentnames: "[]", warp: def.warp ? "true" : "false" } as never,
    });
    // Block ids are local to a procedure; prefix them so procedures do not overwrite each other.
    const ref = (id: string | null) => (id === null ? null : `${code}:${id}`);
    for (const [id, b] of Object.entries(def.blocks)) {
      const inputs = Object.fromEntries(
        Object.entries(b.inputs).map(([k, v]) => [k, typeof v[1] === "string" ? [v[0], ref(v[1])] : v]),
      );
      blocks[`${code}:${id}`] = { ...b, next: ref(b.next), inputs } as Block;
    }
    blocks[`def_${code}`] = block("procedures_definition", {
      topLevel: true,
      next: ref("start"),
      inputs: { custom_block: [1, `proto_${code}`] },
    });
  }
  return target(blocks);
}

function syncOf(t: Target): Record<string, boolean> {
  const table = collectProcedures(t, 0);
  analyzeSync(t, table, builtins);
  return Object.fromEntries([...table.procs].map(([code, p]) => [code, p.sync]));
}

describe("yield declarations match the block handlers", () => {
  it("a statement handler yields exactly when its spec says so", () => {
    for (const [op, handler] of Object.entries(builtins.statements)) {
      const { yields } = builtins.statement(op)!;
      if (typeof yields === "function") continue; // depends on the project, covered below
      const g = stubGen();
      handler(block(op), g);
      expect(g.yielded, op).toBe(yields === "wait" || yields === "loop");
    }
  });

  it("only a statement that runs a substack declares one", () => {
    for (const op of Object.keys(builtins.statements)) {
      const declared = builtins.statement(op)!.substacks ?? [];
      // A stub substack call records the input names the handler compiles.
      const g = stubGen();
      const used: string[] = [];
      g.substack = (_b, name) => (used.push(name), ["  body;"]);
      builtins.statements[op]!(block(op), g);
      expect(used.sort(), op).toEqual([...declared].sort());
    }
  });
});

describe("stackYields", () => {
  const ctx = (blocks: B, warp = false) => ({ blocks, procs: new Map(), warp, registry: builtins });

  it("is false for straight-line code", () => {
    const blocks = { start: block("motion_ifonedgebounce", { next: "b" }), b: block("looks_show") };
    expect(stackYields(ctx(blocks), "start")).toBe(false);
  });

  it("finds a waiting statement later in the chain", () => {
    const blocks = { start: block("looks_show", { next: "w" }), w: block("control_wait") };
    expect(stackYields(ctx(blocks), "start")).toBe(true);
  });

  it("finds a wait inside an if branch", () => {
    const blocks = {
      start: block("control_if_else", { inputs: { SUBSTACK2: [2, "w"] } }),
      w: block("sensing_askandwait"),
    };
    expect(stackYields(ctx(blocks), "start")).toBe(true);
  });

  it("counts a loop unless in warp mode", () => {
    const blocks = { start: block("control_repeat", { inputs: substack("x") }), x: block("looks_show") };
    expect(stackYields(ctx(blocks), "start")).toBe(true);
    expect(stackYields(ctx(blocks, true), "start")).toBe(false);
  });

  it("still counts a wait inside a warp loop", () => {
    const blocks = { start: block("control_forever", { inputs: substack("w") }), w: block("control_wait") };
    expect(stackYields(ctx(blocks, true), "start")).toBe(true);
  });

  it("ignores substacks of statements that do not nest", () => {
    const blocks = { start: block("looks_say", { inputs: substack("w") }), w: block("control_wait") };
    expect(stackYields(ctx(blocks), "start")).toBe(false);
  });

  it("copes with missing blocks and empty stacks", () => {
    expect(stackYields(ctx({}), "nope")).toBe(false);
    expect(stackYields(ctx({}), null)).toBe(false);
  });
});

describe("analyzeSync", () => {
  it("leaves straight-line procedures sync", () => {
    const t = withProcs({ plain: { blocks: { start: block("looks_show") } } });
    expect(syncOf(t)).toEqual({ plain: true });
  });

  it("makes procedures that wait or loop generators", () => {
    const t = withProcs({
      waits: { blocks: { start: block("control_wait") } },
      loops: { blocks: { start: block("control_forever", { inputs: substack("x") }), x: block("looks_show") } },
    });
    expect(syncOf(t)).toEqual({ waits: false, loops: false });
  });

  it("keeps a warp procedure sync when it only loops", () => {
    const t = withProcs({
      warp: { warp: true, blocks: { start: block("control_repeat", { inputs: substack("x") }), x: block("looks_show") } },
    });
    expect(syncOf(t)).toEqual({ warp: true });
  });

  it("spreads through callers, whatever the definition order", () => {
    const t = withProcs({
      outer: { blocks: { start: call("middle") } },
      middle: { blocks: { start: call("inner") } },
      inner: { blocks: { start: block("control_wait") } },
      bystander: { blocks: { start: block("looks_show") } },
    });
    expect(syncOf(t)).toEqual({ outer: false, middle: false, inner: false, bystander: true });
  });

  it("makes a non-warp procedure that calls itself a generator, as scratch-vm and TurboWarp do", () => {
    const t = withProcs({ rec: { blocks: { start: call("rec") } } });
    expect(syncOf(t)).toEqual({ rec: false });
  });

  it("keeps a warp procedure that calls itself sync", () => {
    const t = withProcs({ rec: { warp: true, blocks: { start: call("rec") } } });
    expect(syncOf(t)).toEqual({ rec: true });
  });

  it("only treats direct recursion as a yield", () => {
    const t = withProcs({
      a: { blocks: { start: call("b") } },
      b: { blocks: { start: call("a") } },
    });
    expect(syncOf(t)).toEqual({ a: true, b: true });
  });

  it("makes a warp caller of a waiting procedure a generator", () => {
    const t = withProcs({
      outer: { warp: true, blocks: { start: call("inner") } },
      inner: { blocks: { start: block("control_wait") } },
    });
    expect(syncOf(t)).toEqual({ outer: false, inner: false });
  });

  it("ignores calls to procedures the target does not define", () => {
    const t = withProcs({ p: { blocks: { start: call("missing") } } });
    expect(syncOf(t)).toEqual({ p: true });
  });
});

describe("generated procedures", () => {
  it("are generators exactly when the analysis says", () => {
    const t = withProcs({
      outer: { blocks: { start: call("inner") } },
      inner: { blocks: { start: block("control_wait") } },
      plain: { blocks: { start: block("looks_show") } },
    });
    const { code } = compileProject(project(t));
    expect(code).toMatch(/function\* p1_0\(/);
    expect(code).toMatch(/function\* p1_1\(/);
    expect(code).toMatch(/function p1_2\(/);
  });
});

describe("analyzeEffects", () => {
  const v = (name: string) => ({ VARIABLE: [name, name] as [string, string] });
  const effectsOf = (t: Target) => {
    const table = collectProcedures(t, 0);
    return analyzeEffects(t.blocks, table, (f) => String(f?.[0]));
  };

  it("collects reads, writes and stops through calls and recursion", () => {
    const t = withProcs({
      // outer reads a through an input, assigns b, and calls inner.
      outer: {
        blocks: {
          start: block("data_setvariableto", { fields: v("b"), inputs: { VALUE: [3, [12, "a", "a"], [10, ""]] }, next: "c" }),
          c: call("inner"),
        },
      },
      // inner changes c (a read and a write), loops, and calls itself.
      inner: {
        blocks: {
          start: block("control_repeat", { inputs: substack("body") }),
          body: block("data_changevariableby", { fields: v("c"), next: "again" }),
          again: call("inner"),
        },
      },
      stopper: { blocks: { start: block("control_stop", { fields: { STOP_OPTION: ["all", null] } }) } },
      caller: { blocks: { start: call("stopper") } },
    });
    const e = effectsOf(t);
    expect([...e.get("outer")!.reads].sort()).toEqual(["a", "c"]);
    expect([...e.get("outer")!.writes].sort()).toEqual(["b", "c"]);
    expect(e.get("outer")!.stops).toBe(false);
    expect([...e.get("inner")!.writes]).toEqual(["c"]);
    expect(e.get("caller")!.stops).toBe(true);
  });

  it("counts creating and deleting clones as stops, so callers store every local first", () => {
    const t = withProcs({
      cloner: { blocks: { start: block("control_create_clone_of") } },
      deleter: { blocks: { start: block("control_delete_this_clone") } },
      caller: { blocks: { start: call("cloner") } },
    });
    const e = effectsOf(t);
    expect([e.get("cloner")!.stops, e.get("deleter")!.stops, e.get("caller")!.stops]).toEqual([true, true, true]);
  });

  it("counts a variable reporter block as a read", () => {
    const t = withProcs({
      p: {
        blocks: {
          start: block("looks_say", { inputs: { MESSAGE: [3, "r", [10, ""]] } }),
          r: block("data_variable", { fields: v("x") }),
        },
      },
    });
    expect([...effectsOf(t).get("p")!.reads]).toEqual(["x"]);
  });
});

import { RUNTIME_MODULES } from "@bytecat/runtime/modules";
import type { Block } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { BOOL, within } from "../src/analysis/typeset.js";
import { numEx } from "../src/cast.js";
import {
  BUILTIN_EXTENSIONS, ExtensionRegistry, builtins, checkExtension, hat, missing, reporter, statement, type Extension,
} from "../src/extensions/index.js";
import { CODEGEN_USES, OPS_MODULE, compileProject, referencedNames } from "../src/index.js";
import { block, project, stubGen, target } from "./helpers.js";

/** A third-party extension, written the way docs/extensions.md describes. */
const counter: Extension = {
  id: "counter",
  name: "Counter",
  runtime: "./counter-runtime.js",
  blocks: {
    counter_whenstarted: hat("flag", { restartExistingThreads: true }),
    counter_bump: statement((b, g) => [`bump(rt, ${g.num(b, "BY")});`], { uses: ["bump"] }),
    counter_pause: statement((b, g) => g.y(`yield* pause(rt, ${g.num(b, "SECS")});`), { yields: "wait", uses: ["pause"] }),
    counter_value: reporter(() => numEx("counterValue(rt)"), { uses: ["counterValue"] }),
    counter_reset: missing("statement", "not written yet"),
  },
};

function script(...ops: [string, Partial<Block>?][]): Record<string, Block> {
  const blocks: Record<string, Block> = { hat: block("event_whenflagclicked", { topLevel: true, next: "b0" }) };
  ops.forEach(([op, extra], i) => {
    blocks[`b${i}`] = block(op, { next: i + 1 < ops.length ? `b${i + 1}` : null, ...extra });
  });
  return blocks;
}

describe("the built-in extensions", () => {
  it("are valid and have one extension per opcode prefix", () => {
    for (const e of BUILTIN_EXTENSIONS) expect(checkExtension(e), e.id).toEqual([]);
    expect(BUILTIN_EXTENSIONS.map((e) => e.id)).toEqual([
      "motion", "looks", "sound", "event", "control", "sensing", "operator", "data", "procedures", "argument", "pen",
    ]);
  });

  it("give boolean reporters a boolean result", () => {
    for (const e of BUILTIN_EXTENSIONS) {
      for (const [op, spec] of Object.entries(e.blocks)) {
        if (spec.kind !== "boolean" || !spec.compile) continue;
        expect(within(spec.compile(block(op), stubGen())!.t, BOOL), op).toBe(true);
      }
    }
  });

  it("name only runtime functions their module exports, and every one their code calls", () => {
    // Every name any runtime module exports, with its module.
    const exported = new Map<string, string>();
    for (const [from, m] of Object.entries(RUNTIME_MODULES)) for (const name of Object.keys(m)) exported.set(name, from);
    for (const e of BUILTIN_EXTENSIONS) {
      for (const [op, spec] of Object.entries(e.blocks)) {
        for (const name of spec.uses ?? []) expect(RUNTIME_MODULES[e.runtime!], `${op} uses ${name} from ${e.runtime}`).toHaveProperty(name);
        const compile = spec.kind === "statement" || spec.kind === "reporter" || spec.kind === "boolean" ? spec.compile : undefined;
        if (!compile) continue;
        const out = compile(block(op), stubGen());
        const code = Array.isArray(out) ? out.join("\n") : out?.c ?? "";
        // Runtime functions are plain calls; `rt.` reaches only the runtime's state.
        expect(code, op).not.toMatch(/\brt\.\w+\(/);
        for (const name of referencedNames(code)) {
          const from = exported.get(name);
          if (from === undefined) continue;
          if (from === OPS_MODULE && CODEGEN_USES.includes(name)) continue;
          expect(spec.uses ?? [], `${op} calls ${name}`).toContain(name);
          expect(from, `${op} calls ${name}`).toBe(e.runtime);
        }
      }
    }
  });
});

describe("ExtensionRegistry", () => {
  const ext = (blocks: Extension["blocks"], id = "x"): Extension => ({ id, name: id, blocks });
  const fail = (extensions: Extension[]) => () => new ExtensionRegistry(extensions);

  it("refuses opcodes outside the extension's prefix", () => {
    expect(fail([ext({ y_go: statement(() => []) })])).toThrow("y_go does not start with x_");
  });

  it("refuses an id or opcode registered twice", () => {
    expect(fail([ext({}), ext({})])).toThrow("extension x is registered twice");
    expect(() => builtins.with([ext({ motion_movesteps: statement(() => []) }, "motion")])).toThrow(
      "motion_movesteps is declared by both motion and motion",
    );
  });

  it("refuses statuses that disagree with the spec", () => {
    expect(fail([ext({ x_a: { kind: "statement", status: "missing", note: "n", compile: () => [] } })])).toThrow(
      "x_a is marked missing but compiles",
    );
    expect(fail([ext({ x_a: { kind: "reporter", status: "compiled" } })])).toThrow("x_a is marked compiled but does not compile");
    expect(fail([ext({ x_a: { kind: "statement", status: "partial", compile: () => [] } })])).toThrow("x_a is partial without a note");
    expect(fail([ext({ x_a: { kind: "hat", status: "compiled", event: "flag" } })])).toThrow("x_a has no restartExistingThreads rule");
    expect(fail([ext({ x_a: { kind: "hat", status: "compiled", event: "flag", restartExistingThreads: true, edgeActivated: true } })])).toThrow(
      "x_a is marked compiled but does not compile",
    );
  });

  it("refuses runtime functions without a runtime module", () => {
    expect(fail([ext({ x_a: statement(() => ["go(rt);"], { uses: ["go"] }) })])).toThrow("x_a uses runtime functions, but x names no runtime module");
  });

  it("looks blocks up by kind", () => {
    expect(builtins.statement("motion_movesteps")?.kind).toBe("statement");
    expect(builtins.reporter("operator_lt")?.kind).toBe("boolean");
    expect(builtins.hat("event_whenflagclicked")?.event).toBe("flag");
    expect(builtins.menu("looks_costume")?.field).toBe("COSTUME");
    expect(builtins.statement("operator_lt")).toBeUndefined();
    expect(builtins.extensionOf("pen_penDown")?.id).toBe("pen");
    expect(builtins.spec("constructor")).toBeUndefined();
  });
});

describe("compileProject with a third-party extension", () => {
  const blocks = (): Record<string, Block> => ({
    ...script(["counter_bump", { inputs: { BY: [1, [4, "2"]] } }], ["counter_reset"]),
    hat2: block("counter_whenstarted", { topLevel: true, next: "c0" }),
    c0: block("looks_say", { inputs: { MESSAGE: [3, "v", [10, ""]] } }),
    v: block("counter_value"),
  });

  it("compiles its blocks and hats like built-in ones", () => {
    const { code, imports, warnings } = compileProject(project(target(blocks())), { extensions: [counter] });
    expect(code).toContain("bump(rt, 2);");
    expect(code).toContain('say(rt, t, "say", counterValue(rt));');
    expect(imports).toEqual([
      { from: "./counter-runtime.js", names: ["bump", "counterValue"] },
      { from: "@bytecat/runtime/looks", names: ["say"] },
    ]);
    expect(code.match(/kind: "flag"/g)).toHaveLength(2);
    expect(warnings).toEqual(["counter_reset"]);
  });

  it("reports its blocks as unsupported without it", () => {
    const { warnings } = compileProject(project(target(blocks())));
    // The hat of an unknown extension is reported too, though nothing under it compiles.
    expect(warnings).toEqual(["counter_bump", "counter_reset", "counter_whenstarted"]);
  });

  it("feeds its yield declarations to the procedure analysis", () => {
    const t = target({
      proto: block("procedures_prototype", { mutation: { proccode: "p", argumentnames: "[]", warp: "false" } as never }),
      def: block("procedures_definition", { topLevel: true, next: "w", inputs: { custom_block: [1, "proto"] } }),
      w: block("counter_pause"),
    });
    expect(compileProject(project(t), { extensions: [counter] }).code).toMatch(/function\* p1_0\(/);
  });

  it("warns about extension ids in project.json that no extension declares", () => {
    const p = { ...project(target(blocks())), extensions: ["pen", "counter", "videoSensing", "counter"] } as ProjectJson;
    expect(compileProject(p).unknownExtensions).toEqual(["counter", "videoSensing"]);
    expect(compileProject(p, { extensions: [counter] }).unknownExtensions).toEqual(["videoSensing"]);
  });
});

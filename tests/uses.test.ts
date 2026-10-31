// A program imports exactly the runtime functions its code calls, and each import is declared: by
// the `uses` of a block the project contains, or in CODEGEN_USES for what the code generator
// emits itself. Everything else the code reaches through `rt` is the runtime's state.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CODEGEN_USES, builtins, compileProject, load, referencedNames, statement, type CompileResult, type Extension, type ExtensionRegistry,
} from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { Runtime } from "@bytecat/runtime";
import { RUNTIME_MODULES } from "@bytecat/runtime/modules";
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

/** The runtime state generated code may read or write directly. */
const RUNTIME_STATE = new Set(["stage", "targets", "spin", "answer", "mouse", "counter"]);

type Modules = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** Every name the modules export, with the module. */
function exportsOf(modules: Modules): Map<string, string> {
  const exported = new Map<string, string>();
  for (const [from, m] of Object.entries(modules)) for (const name of Object.keys(m)) exported.set(name, from);
  return exported;
}

/** The names a block in the project or the code generator declares it may call. */
function declared(project: ProjectJson, registry: ExtensionRegistry): Set<string> {
  const names = new Set(CODEGEN_USES);
  for (const target of project.targets) {
    for (const b of Object.values(target.blocks)) {
      if (typeof b === "object" && b !== null && "opcode" in b) for (const u of registry.spec(b.opcode)?.uses ?? []) names.add(u);
    }
  }
  return names;
}

/**
 * What is wrong with a compiled program: a runtime function its code calls that it does not
 * import, an import it does not call or no block declares, and a `rt.` access that is not state.
 */
function problems(result: CompileResult, project: ProjectJson, registry: ExtensionRegistry, modules: Modules = RUNTIME_MODULES): string[] {
  const out: string[] = [];
  const imported = new Map(result.imports.flatMap(({ from, names }) => names.map((n) => [n, from] as const)));
  const called = referencedNames(result.code);
  for (const [name, from] of exportsOf(modules)) {
    if (called.has(name) && imported.get(name) !== from) out.push(`calls ${name} without importing it from ${from}`);
  }
  const ok = declared(project, registry);
  for (const [name] of imported) {
    if (!called.has(name)) out.push(`imports ${name} but does not call it`);
    if (!ok.has(name)) out.push(`imports ${name}, which no block declares`);
  }
  // A string literal (a log message) could look like an access; leave them out.
  const bare = result.code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const [, name] of bare.matchAll(/\brt\.(\w+)/g)) if (!RUNTIME_STATE.has(name!)) out.push(`reads rt.${name}`);
  return out;
}

describe("program imports", () => {
  for (const dir of ["examples", "bench"]) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".sbp")).sort()) {
      it(`are exact in ${dir}/${file.replace(/\.sbp$/, "")}`, () => {
        const { project } = compilePseudo(readFileSync(join(root, dir, file), "utf8"), file);
        expect(problems(compileProject(project.json), project.json, builtins)).toEqual([]);
      });
    }
  }

  it("leave out a code generator helper the code does not call", () => {
    // listContents (a list dropped into an input) is in CODEGEN_USES, but hello calls no such thing.
    const { project } = compilePseudo(readFileSync(join(root, "examples/hello.sbp"), "utf8"), "hello.sbp");
    const { code, imports } = compileProject(project.json);
    expect(code).not.toContain("listContents");
    expect(imports.flatMap((i) => i.names)).not.toContain("listContents");
  });

  describe("of a third-party extension", () => {
    const planted = (uses?: string[]): Extension => ({
      id: "plant",
      name: "Plant",
      runtime: "plant-runtime",
      blocks: { plant_go: statement(() => ["secret(rt, t);"], uses ? { uses } : {}) },
    });
    const blocks = {
      hat: { opcode: "event_whenflagclicked", next: "go", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true },
      go: { opcode: "plant_go", next: null, parent: "hat", inputs: {}, fields: {}, shadow: false, topLevel: false },
    };
    const stage = { isStage: true, name: "Stage", variables: {}, lists: {}, broadcasts: {}, blocks, costumes: [], currentCostume: 0, layerOrder: 0 };
    const project = { targets: [stage] } as unknown as ProjectJson;
    const calls: unknown[] = [];
    const modules = { ...RUNTIME_MODULES, "plant-runtime": { secret: (_rt: unknown, t: unknown) => calls.push(t) } };

    it("are missing a helper a block calls without declaring it", () => {
      const ext = planted();
      const result = compileProject(project, { extensions: [ext] });
      expect(problems(result, project, builtins.with([ext]), modules)).toEqual(["calls secret without importing it from plant-runtime"]);
    });

    it("come from its runtime module, which load binds", () => {
      const ext = planted(["secret"]);
      const result = compileProject(project, { extensions: [ext] });
      expect(result.imports).toEqual([{ from: "plant-runtime", names: ["secret"] }]);
      expect(problems(result, project, builtins.with([ext]), modules)).toEqual([]);
      const rt = new Runtime(project, load(result, modules), { clock: "virtual" });
      rt.runUntilDone();
      expect(calls).toEqual([rt.stage]);
    });
  });
});

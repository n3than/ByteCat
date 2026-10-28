// Every runtime function a compiled program calls is declared: by the `uses` of a block the
// project contains, or in CODEGEN_USES for what the code generator emits itself. The follow-up
// that makes programs import the functions they use relies on this being complete.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CODEGEN_USES, builtins, compileProject, statement, type Extension, type ExtensionRegistry } from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { ops } from "@bytecat/runtime";
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const helpers = Object.keys(ops);

/** The runtime functions `code` reaches: `rt.name`, and calls of the value helpers by name. */
function called(code: string): Set<string> {
  // A string literal (a log message, a costume name) could look like a call; leave them out.
  const bare = code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const names = new Set([...bare.matchAll(/\brt\.(\w+)/g)].map((m) => m[1]!));
  for (const h of helpers) if (new RegExp(`(?<![.\\w])${h}\\(`).test(bare)) names.add(h);
  return names;
}

/** What the program for `project` calls that neither a block in it nor the code generator declares. */
function undeclared(project: ProjectJson, registry: ExtensionRegistry, extensions: Extension[] = []): string[] {
  const declared = new Set(CODEGEN_USES);
  for (const target of project.targets) {
    for (const b of Object.values(target.blocks)) {
      if (typeof b === "object" && b !== null && "opcode" in b) for (const u of registry.spec(b.opcode)?.uses ?? []) declared.add(u);
    }
  }
  const { code } = compileProject(project, { extensions });
  return [...called(code)].filter((name) => !declared.has(name)).sort();
}

describe("declared runtime functions", () => {
  for (const dir of ["examples", "bench"]) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".sbp")).sort()) {
      it(`cover every call in ${dir}/${file.replace(/\.sbp$/, "")}`, () => {
        const { project } = compilePseudo(readFileSync(join(root, dir, file), "utf8"), file);
        expect(undeclared(project.json, builtins)).toEqual([]);
      });
    }
  }

  it("catch a helper a block calls without declaring it", () => {
    const planted = (uses?: string[]): Extension => ({
      id: "plant",
      name: "Plant",
      blocks: { plant_go: statement(() => ["rt.secret(t);", "mod(1, 2);"], uses ? { uses } : {}) },
    });
    const blocks = {
      hat: { opcode: "event_whenflagclicked", next: "go", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true },
      go: { opcode: "plant_go", next: null, parent: "hat", inputs: {}, fields: {}, shadow: false, topLevel: false },
    };
    const project = { targets: [{ isStage: true, name: "Stage", variables: {}, lists: {}, broadcasts: {}, blocks }] } as unknown as ProjectJson;
    const without = planted();
    expect(undeclared(project, builtins.with([without]), [without])).toEqual(["mod", "secret"]);
    const declared = planted(["secret", "mod"]);
    expect(undeclared(project, builtins.with([declared]), [declared])).toEqual([]);
  });
});

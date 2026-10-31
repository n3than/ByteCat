// A bundled page ships only the runtime code its program reaches: the modules it imports, and in
// them only the functions it calls (with what those call).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileProject, toModule } from "@bytecat/compiler";
import { programBundle } from "@bytecat/player/bundle";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

/** The player bundle of an example, unminified so function names can be looked for. */
async function bundleOf(name: string) {
  const { project } = compilePseudo(readFileSync(join(root, "examples", `${name}.sbp`), "utf8"), `${name}.sbp`);
  const result = compileProject(project.json);
  const bundle = await programBundle(toModule(result), { minify: false });
  // The source files that put code in the script.
  const shipped = Object.entries(bundle.inputs)
    .filter(([, input]) => input.bytesInOutput > 0)
    .map(([path]) => path.replace(/\\/g, "/"));
  return { ...bundle, imports: result.imports, shipped };
}

const runtimeLib = (paths: string[]) => paths.filter((p) => p.includes("runtime/src/")).map((p) => p.replace(/.*runtime\/src\//, "")).sort();

describe("a bundled project", () => {
  it("ships the runtime modules its program imports and no others", async () => {
    // hello says a word and logs: looks is the only block module it imports.
    const hello = await bundleOf("hello");
    expect(hello.imports).toEqual([{ from: "@bytecat/runtime/looks", names: ["say"] }]);
    // ops.ts for the toStr that say calls; geometry.ts for the box the player fences and draws with; monitor.ts because the runtime keeps the list monitors.
    expect(runtimeLib(hello.shipped)).toEqual(["geometry.ts", "lib/looks.ts", "monitor.ts", "ops.ts", "runtime.ts", "scheduler.ts", "target.ts", "thread.ts"]);
    // No sound or pen code, and not the table of every module the full player carries.
    expect(hello.shipped.filter((p) => /sound|pen|audio|modules\.ts/i.test(p))).toEqual([]);

    const motion = await bundleOf("motion");
    expect(runtimeLib(motion.shipped)).toEqual(["geometry.ts", "lib/looks.ts", "lib/motion.ts", "monitor.ts", "ops.ts", "runtime.ts", "scheduler.ts", "target.ts", "thread.ts"]);
  });

  it("leaves out the functions of a shipped module that the program does not call", async () => {
    const { script } = await bundleOf("hello");
    expect(script).toMatch(/function say\(/);
    for (const unused of ["sayFor", "switchCostume", "setSize", "goToFront", "glide", "listContents", "itemOf", "wait"]) {
      expect(script, unused).not.toMatch(new RegExp(`function\\*? ${unused}\\(`));
    }
  });
});

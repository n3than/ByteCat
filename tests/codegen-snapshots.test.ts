// Pins the generated JavaScript for every example and bench project. A refactor must leave these
// files untouched; an intentional codegen change shows up as a reviewable diff. Update them with
// `pnpm exec vitest run tests/codegen-snapshots.test.ts -u`.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileProject } from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("generated code", () => {
  for (const dir of ["examples", "bench"]) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".sbp")).sort()) {
      const name = file.replace(/\.sbp$/, "");
      it(`${dir}/${name}`, async () => {
        const { project } = compilePseudo(readFileSync(join(root, dir, file), "utf8"), file);
        await expect(compileProject(project.json).code + "\n").toMatchFileSnapshot(`__snapshots__/${dir}-${name}.js`);
      });
    }
  }
});

// Checks that type inference actually removes the casts and slow comparisons from the benchmark
// hot loops. Correctness is covered elsewhere (examples against TurboWarp, typeset sampling); this
// catches a change that keeps the output right but quietly loses the types.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileProject } from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

/** The generated procedures of a bench project, without the shared prelude and hat list. */
function procedures(name: string): string {
  const { project } = compilePseudo(readFileSync(join(root, "bench", `${name}.sbp`), "utf8"), `${name}.sbp`);
  const code = compileProject(project.json).code;
  return code.slice(code.indexOf("function p"), code.indexOf("return ["));
}

const calls = (code: string, helper: string) => code.split(`${helper}(`).length - 1;

describe("type inference in the benchmarks", () => {
  it("compares loop counters with plain operators", () => {
    for (const name of ["arith", "sieve", "strings"]) {
      const code = procedures(name);
      for (const helper of ["gt", "lt", "eq", "toStr"]) expect(calls(code, helper), `${name}: ${helper}`).toBe(0);
    }
  });

  it("leaves no number cast on a variable in sieve", () => {
    const code = procedures("sieve");
    // The only cast left reads a list item, whose type is not known.
    expect(calls(code, "toNum")).toBe(1);
    expect(code).toMatch(/toNum\(\(S\.l\["list_3"\]\[/);
  });

  it("knows the string accumulator in strings is text", () => {
    const code = procedures("strings");
    expect(calls(code, "toNum")).toBe(0);
    expect(code).toMatch(/\(\w+ > \w+\.length\)/);
  });
});

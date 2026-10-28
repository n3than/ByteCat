// The pseudocode lowering must keep producing the same project.json (and source map) for every
// example, benchmark and fuzz seed, so a refactor of packages/pseudo/src/lower* cannot change a
// block id or an input. The hashes in fixtures/lower-hashes.json were computed before lower.ts was
// split by block family. If lowering is meant to change, regenerate them with
// `WRITE_LOWER_HASHES=1 pnpm exec vitest run tests/lower-hashes.test.ts` and say why in the PR.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";
import { generateProgram } from "./fuzz/generate.js";

const root = join(import.meta.dirname, "..");
const fixturePath = join(import.meta.dirname, "fixtures", "lower-hashes.json");
const FUZZ_SEEDS = 300;

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function hashes(source: string, file: string): { project: string; sourceMap: string } {
  const { project, sourceMap } = compile(source, file);
  return { project: sha(JSON.stringify(project.json)), sourceMap: sha(JSON.stringify(sourceMap)) };
}

const current: Record<string, { project: string; sourceMap: string }> = {};
for (const dir of ["examples", "bench"]) {
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".sbp")).sort()) {
    current[`${dir}/${file}`] = hashes(readFileSync(join(root, dir, file), "utf8"), file);
  }
}
for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
  current[`fuzz/${seed}`] = hashes(generateProgram(seed), `fuzz-${seed}.sbp`);
}

if (process.env.WRITE_LOWER_HASHES) writeFileSync(fixturePath, JSON.stringify(current, null, 1) + "\n");

describe("pseudocode lowering is unchanged", () => {
  const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as typeof current;
  it("covers the same projects", () => {
    expect(Object.keys(current)).toEqual(Object.keys(expected));
  });
  for (const [name, h] of Object.entries(current)) {
    it(name, () => expect(h).toEqual(expected[name]));
  }
});

// The pseudocode lowering must keep producing the same project.json (and source map) for the
// examples, benchmarks and fuzz seeds pinned in fixtures/lower-hashes.json, so a refactor of
// packages/pseudo/src/lower* cannot change a block id or an input. Only the entries in the fixture
// are checked: a new example or benchmark is not a failure, and a changed hash is. Regenerate the
// fixture when lowering or the fuzz generator is meant to change:
// `WRITE_LOWER_HASHES=1 pnpm exec vitest run tests/lower-hashes.test.ts`, then review the diff.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";
import { generateProgram } from "./fuzz/generate.js";

const root = join(import.meta.dirname, "..");
const fixturePath = join(import.meta.dirname, "fixtures", "lower-hashes.json");
const FUZZ_SEEDS = 300;

type Hashes = { project: string; sourceMap: string };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function hashes(source: string, file: string): Hashes {
  const { project, sourceMap } = compile(source, file);
  return { project: sha(JSON.stringify(project.json)), sourceMap: sha(JSON.stringify(sourceMap)) };
}

/** Hashes of one fixture entry (`examples/NAME.sbp`, `bench/NAME.sbp` or `fuzz/SEED`), or null if it no longer exists. */
function current(name: string): Hashes | null {
  const [dir, rest] = name.split("/") as [string, string];
  if (dir === "fuzz") return hashes(generateProgram(Number(rest)), `fuzz-${rest}.sbp`);
  const path = join(root, dir, rest);
  return existsSync(path) ? hashes(readFileSync(path, "utf8"), rest) : null;
}

if (process.env.WRITE_LOWER_HASHES) {
  const names: string[] = [];
  for (const dir of ["examples", "bench"]) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".sbp")).sort()) names.push(`${dir}/${file}`);
  }
  for (let seed = 1; seed <= FUZZ_SEEDS; seed++) names.push(`fuzz/${seed}`);
  writeFileSync(fixturePath, JSON.stringify(Object.fromEntries(names.map((n) => [n, current(n)])), null, 1) + "\n");
}

describe("pseudocode lowering is unchanged", () => {
  const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, Hashes>;
  for (const [name, h] of Object.entries(expected)) {
    it(name, () => {
      const now = current(name);
      expect(now, `${name} is in the fixture but no longer exists; regenerate the fixture`).not.toBeNull();
      expect(now).toEqual(h);
    });
  }
});

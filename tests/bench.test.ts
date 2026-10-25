// Keeps the benchmark set correct: every bench/NAME.sbp must produce bench/NAME.expected on every engine.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { benchmark, engineNames, getEngine } from "@bytecat/bench";
import { compile } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "bench");
const benches = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();
// Every registered engine, so engines added later are checked without editing this file.
const engines = engineNames().map(getEngine);

describe("bench", () => {
  it("has benchmarks", () => expect(benches.length).toBeGreaterThan(0));

  for (const file of benches) {
    const name = file.replace(/\.sbp$/, "");
    const expectedPath = join(dir, `${name}.expected`);

    it(name, async () => {
      expect(existsSync(expectedPath), `missing bench/${name}.expected`).toBe(true);
      const expected = readFileSync(expectedPath, "utf8").split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
      const { project } = compile(readFileSync(join(dir, file), "utf8"), file);
      const result = await benchmark(name, project, expected, engines, { warmup: 0, runs: 1 });
      for (const e of result.engines) expect(e.correct, `${e.engine}: ${e.error}`).toBe(true);
    }, 30_000);
  }
});

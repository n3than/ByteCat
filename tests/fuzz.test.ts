// Differential fuzzing: random programs must log the same on Bytecat as on TurboWarp (the oracle).
// A failing seed is reported with the program; see docs/fuzzing.md for turning it into an example.
import { compile } from "@bytecat/pseudo";
import { describe, expect, it } from "vitest";
import { generateProgram } from "./fuzz/generate.js";
import { describeFailure, failed, fuzzOne } from "./fuzz/run.js";

/** A fixed list, so a failure here is reproducible with `pnpm fuzz --seed N --count 1`. */
const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7 + 1);

describe("fuzz generator", () => {
  it("is deterministic", () => {
    for (const seed of [0, 1, 2, 12345]) expect(generateProgram(seed)).toBe(generateProgram(seed));
    expect(generateProgram(1)).not.toBe(generateProgram(2));
  });

  it("generates valid, finite-looking pseudocode for 500 seeds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const source = generateProgram(seed);
      try {
        compile(source, `seed-${seed}.sbp`);
      } catch (e) {
        throw new Error(`seed ${seed} does not compile: ${e instanceof Error ? e.message : String(e)}\n${source}`);
      }
      // Nothing that makes a run non-deterministic or unbounded.
      expect(source, `seed ${seed}`).not.toMatch(/\b(random|timer|answer|ask|wait|wait_until|forever|mouse_x|key_pressed)\s*\(/);
    }
  });
});

describe("fuzz: Bytecat agrees with TurboWarp", () => {
  it(`on ${SEEDS.length} fixed seeds`, async () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const result = await fuzzOne(seed);
      if (failed(result)) failures.push(describeFailure(result));
    }
    expect(failures, `${failures.length} of ${SEEDS.length} seeds disagree:\n\n${failures.join("\n\n")}\n`).toEqual([]);
  }, 120_000);
});

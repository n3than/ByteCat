import type { Project } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { benchmark, formatTable, type Engine, type EngineResult } from "../src/index.js";

const project = {} as Project;

/** An engine that returns scripted results in order, so timing and failure paths are deterministic. */
function fake(name: string, results: Partial<EngineResult>[]): Engine & { calls: number } {
  const engine = {
    name,
    description: "fake",
    calls: 0,
    async run(): Promise<EngineResult> {
      const r = results[Math.min(engine.calls++, results.length - 1)]!;
      return { log: ["ok"], finished: true, runMs: 0, ...r };
    },
  };
  return engine;
}

describe("benchmark", () => {
  it("reports the median, min and max of the timed runs, excluding warmup", async () => {
    const e = fake("e", [{ runMs: 1000 }, { runMs: 30 }, { runMs: 10 }, { runMs: 20 }, { runMs: 40 }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 1, runs: 4 });
    expect(r.engines[0]).toMatchObject({ engine: "e", medianMs: 25, minMs: 10, maxMs: 40, correct: true });
  });

  it("reports the median compile time when the engine provides one", async () => {
    const e = fake("e", [{ compileMs: 1 }, { compileMs: 5 }, { compileMs: 3 }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 0, runs: 3 });
    expect(r.engines[0]!.compileMs).toBe(3);
  });

  it("marks wrong output as incorrect and stops timing that engine", async () => {
    const e = fake("e", [{ log: ["wrong"] }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 0, runs: 5 });
    expect(r.engines[0]!.correct).toBe(false);
    expect(r.engines[0]!.error).toMatch(/wrong output/);
    expect(e.calls).toBe(1);
  });

  it("marks a run that did not finish as incorrect", async () => {
    const e = fake("e", [{ finished: false }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 0, runs: 2, timeoutMs: 123 });
    expect(r.engines[0]!.error).toMatch(/did not finish within 123 ms/);
  });

  it("passes on an error the engine reports", async () => {
    const e = fake("e", [{ error: "fell back to the interpreter" }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 0, runs: 3 });
    expect(r.engines[0]).toMatchObject({ correct: false, error: "fell back to the interpreter" });
  });

  it("checks output during warmup too", async () => {
    const e = fake("e", [{ log: ["wrong"] }, { log: ["ok"] }]);
    const r = await benchmark("b", project, ["ok"], [e], { warmup: 1, runs: 2 });
    expect(r.engines[0]!.correct).toBe(false);
  });
});

describe("formatTable", () => {
  it("shows times and speedups against the baseline", async () => {
    const fast = fake("fast", [{ runMs: 10 }]);
    const base = fake("scratch-vm", [{ runMs: 100 }]);
    const r = await benchmark("b", project, ["ok"], [fast, base], { warmup: 0, runs: 1 });
    expect(formatTable([r]).split("\n")).toEqual([
      "| benchmark | fast (ms) | scratch-vm (ms) | fast speedup |",
      "| --- | --- | --- | --- |",
      "| b | 10.0 | 100.0 | 10.0x |",
    ]);
  });

  it("shows FAIL and no speedup for an incorrect engine", async () => {
    const bad = fake("bad", [{ log: ["wrong"], runMs: 10 }]);
    const base = fake("scratch-vm", [{ runMs: 100 }]);
    const r = await benchmark("b", project, ["ok"], [bad, base], { warmup: 0, runs: 1 });
    expect(formatTable([r]).split("\n")[2]).toBe("| b | FAIL | 100.0 |  |");
  });

  it("leaves speedups empty when the baseline engine did not run", async () => {
    const r = await benchmark("b", project, ["ok"], [fake("a", [{ runMs: 5 }])], { warmup: 0, runs: 1 });
    expect(formatTable([r]).split("\n")[2]).toBe("| b | 5.0 |  |");
  });
});

import type { Project } from "@bytecat/sb3";
import type { Engine } from "./engines.js";

export interface BenchOptions {
  /** Untimed runs before measuring, so JIT warm-up does not count. Default 1. */
  warmup?: number;
  /** Timed runs; the median is reported. Default 5. */
  runs?: number;
  timeoutMs?: number;
}

export interface EngineStats {
  engine: string;
  /** Median run time in milliseconds over the timed runs. */
  medianMs: number;
  minMs: number;
  maxMs: number;
  compileMs?: number;
  /** True when every run finished and produced the expected log. */
  correct: boolean;
  /** Why the result is not correct, if it is not. */
  error?: string;
}

export interface BenchResult {
  name: string;
  engines: EngineStats[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Runs one project on each engine, checks the output against `expected`, and times it. */
export async function benchmark(
  name: string,
  project: Project,
  expected: string[],
  engines: Engine[],
  options: BenchOptions = {},
): Promise<BenchResult> {
  const { warmup = 1, runs = 5, timeoutMs = 60_000 } = options;
  const stats: EngineStats[] = [];
  for (const engine of engines) {
    const times: number[] = [];
    const compiles: number[] = [];
    let error: string | undefined;
    for (let i = 0; i < warmup + runs; i++) {
      const r = await engine.run(project, { timeoutMs });
      if (r.error) error ??= r.error;
      else if (!r.finished) error ??= `did not finish within ${timeoutMs} ms`;
      else if (JSON.stringify(r.log) !== JSON.stringify(expected)) {
        error ??= `wrong output: got ${JSON.stringify(r.log)}, expected ${JSON.stringify(expected)}`;
      }
      if (i < warmup) continue;
      times.push(r.runMs);
      if (r.compileMs !== undefined) compiles.push(r.compileMs);
      // A wrong or hung engine is not worth timing further.
      if (error) break;
    }
    stats.push({
      engine: engine.name,
      medianMs: median(times),
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      ...(compiles.length ? { compileMs: median(compiles) } : {}),
      correct: error === undefined,
      ...(error ? { error } : {}),
    });
  }
  return { name, engines: stats };
}

/**
 * The engine the speedup columns compare against: an explicit choice, otherwise scratch-vm when it
 * is selected, otherwise the first selected engine other than bytecat. Returns undefined when an
 * explicit choice is not among the selected engines.
 */
export function pickBaseline(selected: string[], explicit?: string): string | undefined {
  if (explicit !== undefined) return selected.includes(explicit) ? explicit : undefined;
  if (selected.includes("scratch-vm")) return "scratch-vm";
  return selected.find((n) => n !== "bytecat") ?? selected[0];
}

/** Formats results as a Markdown table, with each engine's speed relative to the baseline engine. */
export function formatTable(results: BenchResult[], baseline = "scratch-vm"): string {
  const names = [...new Set(results.flatMap((r) => r.engines.map((e) => e.engine)))];
  const header = ["benchmark", ...names.map((n) => `${n} (ms)`), ...names.filter((n) => n !== baseline).map((n) => `${n} speedup`)];
  const rows = results.map((r) => {
    const by = new Map(r.engines.map((e) => [e.engine, e]));
    const base = by.get(baseline);
    const cell = (n: string) => {
      const e = by.get(n);
      if (!e) return "";
      return e.correct ? e.medianMs.toFixed(1) : "FAIL";
    };
    const speed = (n: string) => {
      const e = by.get(n);
      if (!e || !base || !e.correct || !base.correct) return "";
      const ratio = base.medianMs / Math.max(e.medianMs, 0.01);
      // Two significant digits below 1, so a much slower engine reads 0.05x rather than 0.0x.
      return `${ratio < 1 ? ratio.toPrecision(2) : ratio.toFixed(1)}x`;
    };
    return [r.name, ...names.map(cell), ...names.filter((n) => n !== baseline).map(speed)];
  });
  return [header, header.map(() => "---"), ...rows].map((cols) => `| ${cols.join(" | ")} |`).join("\n");
}

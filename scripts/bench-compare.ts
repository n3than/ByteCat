// Compares two sets of `pnpm bench --json` results and writes the Markdown for the PR comment that
// CI posts (see .github/workflows/ci.yml and docs/benchmarks.md, "Comparing a branch with main").
//
//   tsx scripts/bench-compare.ts --base base-1.json,base-2.json --head head-1.json,head-2.json \
//     [--base-sha SHA] [--head-sha SHA] [--threshold 0.1] [-o comment.md]
//
// Each file is the output of one `pnpm bench --json` run, a "round": the median of its timed runs.
// A round is one process, and the process matters: Bytecat's 2 to 10 ms benchmarks vary by 25% and
// more from one process to the next (JIT and GC decisions), however many runs each one times. So
// the comparison is over rounds. It shows the median of the rounds and their spread (Q1 to Q3),
// and flags a Bytecat row only when the head's median is more than the threshold slower AND the
// spreads are apart: the head's Q1 (its fast quarter of rounds) is slower than the base's Q3. A
// difference inside the round-to-round noise is shown as such and not flagged. Files may hold
// different engines or benchmarks; each row uses the rounds that have it. It reports and never
// fails: shared runners are too noisy to gate on, so the exit code is 0 unless the arguments or the
// files are unreadable.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** The part of `BenchResult` (packages/bench) this script reads. */
export interface BenchFile {
  name: string;
  engines: { engine: string; medianMs: number; correct: boolean; error?: string }[];
}

/** Round medians of one benchmark and engine on one side. Q1 and Q3 interpolate between rounds. */
export interface Spread {
  /** Number of rounds. */
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface Row {
  name: string;
  engine: string;
  /** Median over the base runs, in ms; undefined when no base run gave a correct result. */
  base: number | undefined;
  head: number | undefined;
  /** head / base, when both exist. Above 1 means the head is slower. */
  ratio: number | undefined;
  /** The rounds behind `base` and `head`. */
  baseSpread: Spread | undefined;
  headSpread: Spread | undefined;
  /** True for a Bytecat median more than `threshold` slower than the base, beyond the rounds' noise. */
  slower: boolean;
  /** True for a Bytecat median more than `threshold` slower whose spread overlaps the base's: not flagged. */
  withinNoise: boolean;
  /** Sides on which any run of this benchmark and engine gave a wrong log or did not finish. */
  failedOn: ("base" | "head")[];
}

export interface Comparison {
  rows: Row[];
  /** Benchmarks only the head has (new in the PR) or only the base has (removed by it). */
  added: string[];
  removed: string[];
}

/** The engine whose slowdowns are flagged; the others are shown as a noise reference. */
export const FLAGGED_ENGINE = "bytecat";
export const MARKER = "<!-- bytecat-bench-comparison -->";

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Round medians per `name\0engine`, ignoring results that were wrong or failed. */
export function rounds(runs: BenchFile[][]): Map<string, number[]> {
  const samples = new Map<string, number[]>();
  for (const run of runs) {
    for (const bench of run) {
      for (const e of bench.engines) {
        if (!e.correct || e.error !== undefined || !Number.isFinite(e.medianMs)) continue;
        const key = `${bench.name}\0${e.engine}`;
        samples.set(key, [...(samples.get(key) ?? []), e.medianMs]);
      }
    }
  }
  return samples;
}

/** Median time per `name\0engine` over the rounds. */
export function medians(runs: BenchFile[][]): Map<string, number> {
  return new Map([...rounds(runs)].map(([k, v]) => [k, median(v)]));
}

/** The q-quantile (0 to 1) by linear interpolation between order statistics. */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function spread(xs: number[] | undefined): Spread | undefined {
  if (!xs?.length) return undefined;
  return { n: xs.length, min: Math.min(...xs), q1: quantile(xs, 0.25), median: median(xs), q3: quantile(xs, 0.75), max: Math.max(...xs) };
}

/** Every benchmark and engine named in any of the runs, in first-seen order. */
function keys(runs: BenchFile[][]): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const run of runs) {
    for (const bench of run) {
      for (const e of bench.engines) {
        const key = `${bench.name}\0${e.engine}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push([bench.name, e.engine]);
        }
      }
    }
  }
  return out;
}

/** True when any run gave a wrong log or did not finish for this benchmark and engine. */
function anyFailed(runs: BenchFile[][], name: string, engine: string): boolean {
  return runs.some((run) =>
    run.some((b) => b.name === name && b.engines.some((e) => e.engine === engine && (!e.correct || e.error !== undefined))),
  );
}

export function compare(base: BenchFile[][], head: BenchFile[][], threshold = 0.1): Comparison {
  const b = rounds(base);
  const h = rounds(head);
  const baseNames = new Set(base.flat().map((r) => r.name));
  const headNames = new Set(head.flat().map((r) => r.name));
  const rows: Row[] = [];
  for (const [name, engine] of keys(head)) {
    // A benchmark only one side has cannot be compared, so it is listed apart.
    if (!baseNames.has(name) || !headNames.has(name)) continue;
    const key = `${name}\0${engine}`;
    const baseSpread = spread(b.get(key));
    const headSpread = spread(h.get(key));
    const baseMs = baseSpread?.median;
    const headMs = headSpread?.median;
    const ratio = baseMs !== undefined && headMs !== undefined && baseMs > 0 ? headMs / baseMs : undefined;
    // Over the threshold, and the head's fast quarter of rounds is slower than the base's slow quarter.
    const over = engine === FLAGGED_ENGINE && ratio !== undefined && ratio > 1 + threshold;
    const apart = baseSpread !== undefined && headSpread !== undefined && headSpread.q1 > baseSpread.q3;
    rows.push({
      name,
      engine,
      base: baseMs,
      head: headMs,
      ratio,
      baseSpread,
      headSpread,
      slower: over && apart,
      withinNoise: over && !apart,
      failedOn: [...(anyFailed(base, name, engine) ? (["base"] as const) : []), ...(anyFailed(head, name, engine) ? (["head"] as const) : [])],
    });
  }
  return {
    rows,
    added: [...headNames].filter((n) => !baseNames.has(n)),
    removed: [...baseNames].filter((n) => !headNames.has(n)),
  };
}

const ms = (v: number | undefined) => (v === undefined ? "FAIL" : v.toFixed(1));

/** Q1 to Q3 of a side's rounds, in ms. */
const range = (s: Spread | undefined) => (s === undefined ? "n/a" : `${s.q1.toFixed(1)}\u2013${s.q3.toFixed(1)}`);

function change(r: Row): string {
  if (r.failedOn.length) return `FAIL on ${r.failedOn.join(" and ")}`;
  if (r.ratio === undefined) return "n/a";
  const pct = (r.ratio - 1) * 100;
  const text = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  if (r.slower) return `**${text}** :warning:`;
  return r.withinNoise ? `${text} (within noise)` : text;
}

export interface CommentOptions {
  baseSha?: string;
  headSha?: string;
  threshold?: number;
}

/** The most rounds any row has on each side, per engine: "bytecat 10, turbowarp 2". */
function roundCounts(c: Comparison): string {
  const counts = new Map<string, number>();
  for (const r of c.rows) {
    const n = Math.max(r.baseSpread?.n ?? 0, r.headSpread?.n ?? 0);
    counts.set(r.engine, Math.max(counts.get(r.engine) ?? 0, n));
  }
  return [...counts].map(([engine, n]) => `${engine} ${n}`).join(", ");
}

/** The PR comment: a table of medians per benchmark and engine, with slow Bytecat rows flagged. */
export function renderComment(c: Comparison, o: CommentOptions = {}): string {
  const threshold = o.threshold ?? 0.1;
  const pct = Math.round(threshold * 100);
  const slower = c.rows.filter((r) => r.slower);
  const short = (s: string | undefined) => (s ? `\`${s.slice(0, 7)}\`` : "");
  const failed = c.rows.filter((r) => r.engine === FLAGGED_ENGINE && r.failedOn.length);
  const lines = [MARKER, "## Benchmark comparison", ""];
  if (failed.length) {
    // A wrong log is worse than a slowdown, so it comes first in the headline.
    lines.push(
      `:x: Bytecat gave a wrong log or did not finish: ${failed.map((r) => `\`${r.name}\` on ${r.failedOn.join(" and ")}`).join(", ")}. ` +
        "A failing result is not comparable, so fix it before reading the timings.",
      "",
    );
  }
  if (slower.length) {
    lines.push(
      `:warning: ${slower.length} Bytecat median${slower.length === 1 ? " is" : "s are"} more than ${pct}% slower than main, beyond the noise between rounds: ` +
        `${slower.map((r) => `\`${r.name}\``).join(", ")}. ` +
        "The roadmap needs a stated reason for each.",
    );
  } else if (failed.length) {
    // The failure line above is the headline; no claim about the other benchmarks.
  } else if (c.rows.some((r) => r.engine === FLAGGED_ENGINE && r.ratio !== undefined)) {
    lines.push(`No Bytecat median is more than ${pct}% slower than main beyond the noise between rounds.`);
  } else {
    lines.push("Nothing to compare: no benchmark gave a correct result on both sides.");
  }
  lines.push(
    "",
    `Median over rounds, in ms, base ${short(o.baseSha)} (main) against head ${short(o.headSha)} (this PR). ` +
      `Rounds per side (interleaved, each a separate process): ${roundCounts(c) || "none"}. ` +
      "Higher is slower. A Bytecat row is flagged only when its median is " +
      `more than ${pct}% slower and the head's Q1 of rounds is slower than the base's Q3; ` +
      "a bigger difference inside that spread is marked \"within noise\". This report never fails the build.",
    "",
    "| benchmark | engine | base (ms) | head (ms) | change | rounds Q1\u2013Q3, base | rounds Q1\u2013Q3, head |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const r of c.rows) {
    lines.push(`| ${r.name} | ${r.engine} | ${ms(r.base)} | ${ms(r.head)} | ${change(r)} | ${range(r.baseSpread)} | ${range(r.headSpread)} |`);
  }
  if (c.added.length) lines.push("", `New in this PR (nothing to compare with): ${c.added.map((n) => `\`${n}\``).join(", ")}.`);
  if (c.removed.length) lines.push("", `Removed by this PR: ${c.removed.map((n) => `\`${n}\``).join(", ")}.`);
  lines.push("", "Only the Bytecat rows are flagged; the others show how much the runner itself drifted between the two builds.", "");
  return lines.join("\n");
}

function readRuns(list: string): BenchFile[][] {
  return list
    .split(",")
    .filter((f) => f !== "")
    .map((f) => JSON.parse(readFileSync(f, "utf8")) as BenchFile[]);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string" },
      "base-sha": { type: "string" },
      "head-sha": { type: "string" },
      threshold: { type: "string", default: "0.1" },
      out: { type: "string", short: "o" },
    },
  });
  const threshold = Number(values.threshold);
  if (!values.base || !values.head || !(threshold > 0)) {
    console.error("Usage: bench-compare --base a.json,b.json --head c.json,d.json [--base-sha S] [--head-sha S] [--threshold 0.1] [-o comment.md]");
    process.exit(2);
  }
  const base = readRuns(values.base);
  const head = readRuns(values.head);
  const text = renderComment(compare(base, head, threshold), {
    baseSha: values["base-sha"],
    headSha: values["head-sha"],
    threshold,
  });
  if (values.out) writeFileSync(values.out, text);
  else console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

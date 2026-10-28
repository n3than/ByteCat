// Compares two sets of `pnpm bench --json` results and writes the Markdown for the PR comment that
// CI posts (see .github/workflows/ci.yml and docs/benchmarks.md, "Comparing a branch with main").
//
//   tsx scripts/bench-compare.ts --base base-1.json,base-2.json --head head-1.json,head-2.json \
//     [--base-sha SHA] [--head-sha SHA] [--threshold 0.1] [-o comment.md]
//
// Each file is the output of one `pnpm bench --json` run; the median over the files is compared, so
// interleaved runs (base, head, base, head) cancel out part of the runner's drift. It reports and
// never fails: shared runners are too noisy to gate on, so the exit code is 0 unless the arguments
// or the files are unreadable.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** The part of `BenchResult` (packages/bench) this script reads. */
export interface BenchFile {
  name: string;
  engines: { engine: string; medianMs: number; correct: boolean; error?: string }[];
}

export interface Row {
  name: string;
  engine: string;
  /** Median over the base runs, in ms; undefined when no base run gave a correct result. */
  base: number | undefined;
  head: number | undefined;
  /** head / base, when both exist. Above 1 means the head is slower. */
  ratio: number | undefined;
  /** True for a Bytecat median more than `threshold` slower than the base. */
  slower: boolean;
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

/** Median time per `name\0engine` over the runs, ignoring results that were wrong or failed. */
export function medians(runs: BenchFile[][]): Map<string, number> {
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
  return new Map([...samples].map(([k, v]) => [k, median(v)]));
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

export function compare(base: BenchFile[][], head: BenchFile[][], threshold = 0.1): Comparison {
  const b = medians(base);
  const h = medians(head);
  const baseNames = new Set(base.flat().map((r) => r.name));
  const headNames = new Set(head.flat().map((r) => r.name));
  const rows: Row[] = [];
  for (const [name, engine] of keys(head)) {
    // A benchmark only one side has cannot be compared, so it is listed apart.
    if (!baseNames.has(name) || !headNames.has(name)) continue;
    const key = `${name}\0${engine}`;
    const baseMs = b.get(key);
    const headMs = h.get(key);
    const ratio = baseMs !== undefined && headMs !== undefined && baseMs > 0 ? headMs / baseMs : undefined;
    rows.push({
      name,
      engine,
      base: baseMs,
      head: headMs,
      ratio,
      slower: engine === FLAGGED_ENGINE && ratio !== undefined && ratio > 1 + threshold,
    });
  }
  return {
    rows,
    added: [...headNames].filter((n) => !baseNames.has(n)),
    removed: [...baseNames].filter((n) => !headNames.has(n)),
  };
}

const ms = (v: number | undefined) => (v === undefined ? "FAIL" : v.toFixed(1));

function change(r: Row): string {
  if (r.ratio === undefined) return r.head === undefined && r.base !== undefined ? "FAIL on head" : "n/a";
  const pct = (r.ratio - 1) * 100;
  const text = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return r.slower ? `**${text}** :warning:` : text;
}

export interface CommentOptions {
  baseSha?: string;
  headSha?: string;
  threshold?: number;
  baseRuns?: number;
  headRuns?: number;
}

/** The PR comment: a table of medians per benchmark and engine, with slow Bytecat rows flagged. */
export function renderComment(c: Comparison, o: CommentOptions = {}): string {
  const threshold = o.threshold ?? 0.1;
  const slower = c.rows.filter((r) => r.slower);
  const short = (s: string | undefined) => (s ? `\`${s.slice(0, 7)}\`` : "");
  const lines = [MARKER, "## Benchmark comparison", ""];
  if (slower.length) {
    lines.push(
      `:warning: ${slower.length} Bytecat median${slower.length === 1 ? " is" : "s are"} more than ${Math.round(threshold * 100)}% slower than main: ` +
        `${slower.map((r) => `\`${r.name}\``).join(", ")}. ` +
        "The roadmap needs a stated reason for each. Shared runners are noisy, so re-run before trusting a small difference.",
    );
  } else if (c.rows.some((r) => r.engine === FLAGGED_ENGINE && r.ratio !== undefined)) {
    lines.push(`No Bytecat median is more than ${Math.round(threshold * 100)}% slower than main.`);
  } else {
    lines.push("Nothing to compare: no benchmark gave a correct result on both sides.");
  }
  lines.push(
    "",
    `Median run time in ms, base ${short(o.baseSha)} (main) against head ${short(o.headSha)} (this PR), ` +
      `${o.baseRuns ?? "?"} interleaved runs each; a run is itself a median of timed runs. Higher is slower. ` +
      "This report never fails the build.",
    "",
    "| benchmark | engine | base (ms) | head (ms) | change |",
    "| --- | --- | ---: | ---: | ---: |",
  );
  for (const r of c.rows) lines.push(`| ${r.name} | ${r.engine} | ${ms(r.base)} | ${ms(r.head)} | ${change(r)} |`);
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
    baseRuns: base.length,
    headRuns: head.length,
  });
  if (values.out) writeFileSync(values.out, text);
  else console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

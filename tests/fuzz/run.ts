// Runs one generated program on Bytecat and on TurboWarp and compares the `log` lists.
// TurboWarp (compiler on) is the ground truth; scratch-vm can be run too, for information only.
import { compile as compileToJs } from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import { Runtime } from "@bytecat/runtime";
import { readSb3, writeSb3, type Project } from "@bytecat/sb3";
import { generateProgram } from "./generate.js";

export interface Diff {
  /** Index of the first log line that differs; a missing line is `undefined`. */
  index: number;
  bytecat: string | undefined;
  /** The other engine's line (TurboWarp's, or scratch-vm's in `scratchDiff`). */
  other: string | undefined;
}

export interface FuzzResult {
  seed: number;
  source: string;
  bytecat: string[];
  turbowarp: string[];
  /** First difference between Bytecat and TurboWarp, or null when the logs are equal. */
  firstDiff: Diff | null;
  /**
   * Problems that make the comparison unreliable or are bugs in their own right: Bytecat threw,
   * an engine did not finish, TurboWarp could not compile a script.
   */
  problems: string[];
  /** Only with `scratch: true`: scratch-vm's log and its first difference from TurboWarp. */
  scratch?: string[];
  scratchDiff?: Diff | null;
}

export interface FuzzOptions {
  /** Also run scratch-vm and compare it with TurboWarp. */
  scratch?: boolean;
  timeoutMs?: number;
}

export function firstDiff(a: string[], b: string[]): Diff | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return { index: i, bytecat: a[i], other: b[i] };
  return null;
}

/** True when the result shows a disagreement or a problem. */
export function failed(r: FuzzResult): boolean {
  return r.firstDiff !== null || r.problems.length > 0;
}

function runBytecat(project: Project, timeoutMs: number, problems: string[]): string[] {
  try {
    const { program } = compileToJs(project.json);
    const rt = new Runtime(project.json, program, { clock: "virtual", turbo: true });
    const { finished } = rt.runUntilDone(timeoutMs);
    if (!finished) problems.push(`bytecat did not finish within ${timeoutMs} ms`);
    return rt.log();
  } catch (e) {
    problems.push(`bytecat threw: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

export async function fuzzOne(seed: number, options: FuzzOptions = {}): Promise<FuzzResult> {
  const { timeoutMs = 5000 } = options;
  const source = generateProgram(seed);
  const project = compilePseudo(source, `seed-${seed}.sbp`).project;
  const problems: string[] = [];

  // Every engine gets the same bytes. Bytecat reads the project back from the .sb3, as the CLI does:
  // the in-memory project still holds values JSON cannot store, such as the number -0.
  const sb3 = writeSb3(project);
  const bytecat = runBytecat(readSb3(sb3), timeoutMs, problems);

  const tw = await runProject(sb3, { timeoutMs, engine: "turbowarp", quiet: true });
  if (!tw.finished) problems.push(`turbowarp did not finish within ${timeoutMs} ms`);
  for (const e of tw.compileErrors) problems.push(`turbowarp could not compile: ${e}`);

  const result: FuzzResult = {
    seed, source, bytecat, turbowarp: tw.log, firstDiff: firstDiff(bytecat, tw.log), problems,
  };
  if (options.scratch) {
    const sc = await runProject(sb3, { timeoutMs, engine: "scratch", quiet: true });
    result.scratch = sc.log;
    const d = firstDiff(sc.log, tw.log);
    // `bytecat` in this diff is scratch-vm's line, `other` is TurboWarp's.
    result.scratchDiff = d;
  }
  return result;
}

/** A readable description of a failure, for the CLI and the test. */
export function describeFailure(r: FuzzResult): string {
  const lines = [`seed ${r.seed}`];
  for (const p of r.problems) lines.push(`  problem: ${p}`);
  if (r.firstDiff) {
    const d = r.firstDiff;
    const show = (v: string | undefined) => (v === undefined ? "<missing>" : JSON.stringify(v));
    lines.push(`  log line ${d.index}: bytecat ${show(d.bytecat)} but turbowarp ${show(d.other)}`);
    lines.push(`  bytecat   (${r.bytecat.length} lines): ${JSON.stringify(r.bytecat.slice(0, d.index + 3))}`);
    lines.push(`  turbowarp (${r.turbowarp.length} lines): ${JSON.stringify(r.turbowarp.slice(0, d.index + 3))}`);
  }
  lines.push("  program:", ...r.source.trimEnd().split("\n").map((l) => `    ${l}`));
  return lines.join("\n");
}

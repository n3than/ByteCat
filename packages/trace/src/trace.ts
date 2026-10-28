// The trace oracle: two lockstep engines side by side, the same input before the same frames, and
// a snapshot comparison after every frame. See docs/testing.md.
import { readSb3 } from "@bytecat/sb3";
import { BytecatLockstep } from "./bytecat.js";
import { describeDiff, diffSnapshots, type FieldDiff } from "./diff.js";
import type { FrameOptions, LockstepEngine } from "./engine.js";
import { schedule, type Command } from "./input.js";
import type { Snapshot } from "./snapshot.js";
import { TurboWarpEngine } from "./turbowarp.js";

export interface TraceOptions extends FrameOptions {
  /** Frames to run and compare after the green flag. */
  frames: number;
  /** Scripted input (`parseInput`). */
  input?: readonly Command[];
  /**
   * Stop early once neither engine has a script left and the input is used up. Default true.
   * Snapshots cannot change after that.
   */
  untilDone?: boolean;
}

export interface TraceResult {
  /** Frames compared after frame 0 (fewer than asked when the run ended or a difference was found). */
  frames: number;
  /** The first difference, or null when every compared frame agrees. */
  diff: FieldDiff | null;
  /** Problems that make the comparison unreliable: unsupported blocks, a compiler fallback, a crash. */
  problems: string[];
  /** Whether each engine still had scripts running at the end. */
  running: { actual: boolean; expected: boolean };
  /** The last snapshots compared (the differing ones when `diff` is set). */
  actual: Snapshot;
  expected: Snapshot;
  /** The last frame both agreed on before the difference, when there is one. */
  agreed?: { actual: Snapshot; expected: Snapshot };
}

/** Runs `actual` and `expected` in lockstep and compares them after every frame. */
export async function traceEngines(actual: LockstepEngine, expected: LockstepEngine, options: TraceOptions): Promise<TraceResult> {
  const { events, lastFrame } = schedule(options.input ?? []);
  const engines = [actual, expected] as const;
  const answers = engines.map(() => [] as string[]);
  const problems = () => [...actual.problems, ...expected.problems];

  let snapshots = engines.map((e) => e.snapshot(0)) as [Snapshot, Snapshot];
  let agreed: TraceResult["agreed"];
  const result = (frames: number, diff: FieldDiff | null, extra: string[] = []): TraceResult => ({
    frames,
    diff,
    problems: [...problems(), ...extra],
    running: { actual: actual.running, expected: expected.running },
    actual: snapshots[0],
    expected: snapshots[1],
    ...(diff && agreed ? { agreed } : {}),
  });

  let diff = diffSnapshots(...snapshots);
  if (diff) return result(0, diff);
  let next = 0;
  for (let frame = 1; frame <= options.frames; frame++) {
    for (; next < events.length && events[next]!.frame === frame; next++) {
      const c = events[next]!.command;
      engines.forEach((e, i) => {
        if (c.op === "press") e.keyDown(c.key);
        else if (c.op === "release") e.keyUp(c.key);
        else if (c.op === "mouse") e.mouseMove(c.x, c.y);
        else if (c.op === "click") e.click(c.x, c.y);
        else if (c.op === "answer") answers[i]!.push(c.text);
      });
    }
    try {
      for (const [i, e] of engines.entries()) {
        while (answers[i]!.length > 0 && e.questions.length > 0) await e.answer(answers[i]!.shift()!);
        await e.step();
      }
    } catch (e) {
      return result(frame - 1, null, [`${e instanceof Error ? e.stack ?? e.message : String(e)}`]);
    }
    agreed = { actual: snapshots[0], expected: snapshots[1] };
    snapshots = engines.map((e) => e.snapshot(frame)) as [Snapshot, Snapshot];
    diff = diffSnapshots(...snapshots);
    if (diff) return result(frame, diff);
    if ((options.untilDone ?? true) && frame >= lastFrame && !actual.running && !expected.running) return result(frame, null);
  }
  return result(options.frames, null);
}

/** Traces an .sb3 on Bytecat (actual) against TurboWarp (expected). */
export async function traceProject(sb3: Uint8Array, options: TraceOptions): Promise<TraceResult> {
  // Bytecat reads the project back from the bytes, like the CLI, so both engines see the same data.
  const bytecat = new BytecatLockstep(readSb3(sb3).json, options);
  const turbowarp = await TurboWarpEngine.load(sb3, options);
  try {
    return await traceEngines(bytecat, turbowarp, options);
  } finally {
    bytecat.dispose();
    turbowarp.dispose();
  }
}

/** A readable report: agreement, or the first difference with the fields around it. */
export function describeTrace(r: TraceResult): string {
  const lines: string[] = [];
  for (const p of r.problems) lines.push(`problem: ${p}`);
  if (!r.diff) {
    const state = r.running.actual || r.running.expected ? "still running" : "every script finished";
    lines.push(`agree on ${r.frames} frame(s) (${state})`);
    return lines.join("\n");
  }
  lines.push(`first difference at ${describeDiff(r.diff)}`);
  if (r.agreed) {
    const before = r.agreed.expected.fields[r.diff.field];
    if (before !== undefined) lines.push(`  at frame ${r.agreed.expected.frame} both had ${JSON.stringify(before)}`);
  }
  // Other fields that differ in the same frame, so a cascade is easy to see.
  const others = Object.keys({ ...r.actual.fields, ...r.expected.fields }).filter(
    (k) => k !== r.diff!.field && JSON.stringify(r.actual.fields[k]) !== JSON.stringify(r.expected.fields[k]),
  );
  for (const k of others.slice(0, 8)) {
    lines.push(`  also ${k}: bytecat ${JSON.stringify(r.actual.fields[k])} but turbowarp ${JSON.stringify(r.expected.fields[k])}`);
  }
  if (others.length > 8) lines.push(`  and ${others.length - 8} more field(s)`);
  return lines.join("\n");
}

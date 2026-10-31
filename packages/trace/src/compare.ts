// The relaxed comparison: Bytecat (its own defaults) against TurboWarp, checked at checkpoints
// with tolerances instead of after every frame. It is the default check of an example and of a
// real .sb3 (docs/testing.md, "Relaxed and exact checks"). The engines still run in lockstep, on
// the same virtual clock and pass budget as the trace, so a run is deterministic; only the
// comparison is looser. No Node imports (files.ts reads sidecar files).
import type { FrameOptions, LockstepEngine } from "./engine.js";
import { schedule, type Command } from "./input.js";
import type { FieldValue, Snapshot } from "./snapshot.js";

/** The per-project settings, from `NAME.compare.json`. Every field is optional. */
export interface CompareConfig {
  /** Frames between checkpoints. Frame 0 and the last frame are always checkpoints. Default 10. */
  every?: number;
  /**
   * Timing tolerance: a Bytecat value at checkpoint frame f matches when TurboWarp shows it at any
   * frame from f - window to f + window. Default 2.
   */
  window?: number;
  /** Numbers match when within `abs` of each other, or within `rel` of the larger. Default 1e-6 and 1e-9. */
  tolerance?: { abs?: number; rel?: number };
  /**
   * Named intended differences (`ALLOWANCES`) to allow on top of `DEFAULT_ALLOW`. A difference an
   * allowance covers never fails the check.
   */
  allow?: string[];
  /**
   * Field paths not to compare, such as `Stage.var.alive` or `Stage.list.log`; `*` matches any
   * run of characters (`Cat#*.x`). For values that follow from an intended difference.
   */
  ignore?: string[];
  /** A note saying why the file exists. Ignored by the checker. */
  why?: string;
}

export interface CompareOptions extends FrameOptions, CompareConfig {
  /** Frames to run after the green flag. */
  frames: number;
  /** Scripted input (`parseInput`). */
  input?: readonly Command[];
  /** Stop once neither engine is running and the input is used up. Default true. */
  untilDone?: boolean;
}

/** One field that matched no TurboWarp value in its frame window. */
export interface Mismatch {
  /** The checkpoint frame. */
  frame: number;
  /** The field path, as in a snapshot (`Cat.x`, `Stage.list.log`), or `clones` or `running`. */
  field: string;
  /** For a list: the 0-based index of the first item that differs from TurboWarp's at `frame`. */
  index?: number;
  /** Bytecat's value at `frame`; undefined when it has no such field. */
  actual: FieldValue | undefined;
  /** TurboWarp's value at each frame of the window it had a snapshot for, in frame order. */
  expected: { frame: number; value: FieldValue | undefined }[];
  /** The frames searched. */
  window: [from: number, to: number];
}

export interface CompareResult {
  /** Frames run after frame 0. */
  frames: number;
  /** Checkpoints compared, up to and including the mismatch. */
  checkpoints: number;
  /** The first mismatch, or null when every checkpoint agrees. */
  mismatch: Mismatch | null;
  /** The allowances that covered a difference, so a report can say what was let through. */
  allowed: string[];
  /** Problems that make the comparison unreliable: unsupported blocks, a compiler fallback, a crash. */
  problems: string[];
  running: { actual: boolean; expected: boolean };
}

/** A difference an allowance looks at: one field at one checkpoint against one TurboWarp frame. */
export interface Candidate {
  field: string;
  actual: FieldValue | undefined;
  expected: FieldValue | undefined;
  /** Clones each engine had in the two snapshots. */
  clones: { actual: number; expected: number };
}

/** An intended Bytecat difference from TurboWarp (docs/deviations.md), which the check lets through. */
export interface Allowance {
  why: string;
  allows(c: Candidate): boolean;
}

// Field paths are `TARGET.FIELD`, and target, variable and list names may contain dots, so the
// patterns anchor on the field part. A clone is labelled `Sprite#k` (`cloneLabels`).
const isCloneField = (field: string) => /^.+#\d+\.(x|y|direction|size|visible|costume|rotationStyle|bubble|var\.|list\.)/.test(field);
const isCloneCostume = (field: string) => /^.+#\d+\.costume$/.test(field) && !/\.(var|list)\./.test(field);

/** The named intended differences. Each entry matches an "Intended Bytecat differences" row. */
export const ALLOWANCES: Readonly<Record<string, Allowance>> = {
  "clone-limit": {
    why: "Bytecat has no clone limit by default; TurboWarp stops at 300 clones",
    // Once TurboWarp is at its limit and Bytecat has more, the clones themselves cannot be paired
    // up, so their fields, the clone count and the layer order are not compared.
    allows: (c) =>
      c.clones.expected === 300 && c.clones.actual > 300 && (c.field === "clones" || c.field === "layers" || isCloneField(c.field)),
  },
  "min-size": {
    why: "Bytecat does not force a minimum size; TurboWarp keeps a costume at least 5 pixels wide or tall",
    allows: (c) =>
      c.field.endsWith(".size") && typeof c.actual === "string" && typeof c.expected === "string" &&
      Number(c.actual) < Number(c.expected) && Number(c.expected) <= 100,
  },
};

/** The allowances every relaxed comparison uses: all of the intended differences. */
export const DEFAULT_ALLOW: readonly string[] = Object.keys(ALLOWANCES);

/** The snapshot fields the relaxed check compares (the bubble and rotation style are left out). */
const COMPARED = /^(layers|.+\.(x|y|direction|size|visible|costume)|.+?\.(var|list)\..*)$/;

function cloneCount(s: Snapshot): number {
  let n = 0;
  for (const k of Object.keys(s.fields)) if (isCloneCostume(k)) n++;
  return n;
}

/** The compared fields of a snapshot, plus the clone count. */
function fieldsOf(s: Snapshot, skip: (field: string) => boolean): Map<string, FieldValue> {
  const out = new Map<string, FieldValue>();
  for (const [k, v] of Object.entries(s.fields)) if (COMPARED.test(k) && !skip(k)) out.set(k, v);
  if (!skip("clones")) out.set("clones", String(cloneCount(s)));
  return out;
}

/** Whether two numbers written as display text are within the tolerance. Only canonical numbers count. */
function closeNumbers(a: string, b: string, abs: number, rel: number): boolean {
  const x = Number(a);
  const y = Number(b);
  if (a === "" || b === "" || String(x) !== a || String(y) !== b || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const d = Math.abs(x - y);
  return d <= abs || d <= rel * Math.max(Math.abs(x), Math.abs(y));
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined, abs = 1e-6, rel = 1e-9): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "string" || typeof b === "string") {
    return typeof a === "string" && typeof b === "string" && closeNumbers(a, b, abs, rel);
  }
  return a.length === b.length && a.every((x, i) => x === b[i] || closeNumbers(x, b[i]!, abs, rel));
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
}

/** Checks a config's fields and names, so a typo in a sidecar file is an error, not a silent pass. */
export function checkConfig(config: CompareConfig, file = "config"): void {
  const known = new Set(["every", "window", "tolerance", "allow", "ignore", "why"]);
  for (const k of Object.keys(config)) if (!known.has(k)) throw new Error(`${file}: unknown setting "${k}" (expected ${[...known].join(", ")})`);
  for (const name of config.allow ?? []) {
    if (!ALLOWANCES[name]) throw new Error(`${file}: unknown allowance "${name}" (expected ${Object.keys(ALLOWANCES).join(", ")})`);
  }
  if (config.every !== undefined && !(Number.isInteger(config.every) && config.every >= 1)) throw new Error(`${file}: "every" must be a whole number of at least 1`);
  if (config.window !== undefined && !(Number.isInteger(config.window) && config.window >= 0)) throw new Error(`${file}: "window" must be a whole number of at least 0`);
}

/**
 * Compares Bytecat's snapshot at a checkpoint with TurboWarp's snapshots around it. `window` maps
 * each frame of the window to TurboWarp's snapshot there (frames without one are left out).
 * Returns the first mismatch, or null; adds the allowances it used to `allowed`.
 */
export function compareCheckpoint(
  actual: Snapshot,
  window: readonly Snapshot[],
  config: CompareConfig = {},
  allowed: Set<string> = new Set(),
): Mismatch | null {
  const abs = config.tolerance?.abs ?? 1e-6;
  const rel = config.tolerance?.rel ?? 1e-9;
  const allow = [...new Set([...DEFAULT_ALLOW, ...(config.allow ?? [])])].map((n) => [n, ALLOWANCES[n]!] as const);
  const ignore = (config.ignore ?? []).map(globToRegExp);
  const skip = (field: string) => ignore.some((r) => r.test(field));
  const at = window.find((s) => s.frame === actual.frame) ?? window[0];
  if (!at) return null;
  const mine = fieldsOf(actual, skip);
  const theirs = window.map((s) => ({ frame: s.frame, fields: fieldsOf(s, skip), clones: cloneCount(s) }));
  const myClones = cloneCount(actual);
  const fields = new Set([...mine.keys(), ...fieldsOf(at, skip).keys()]);
  for (const field of fields) {
    const a = mine.get(field);
    if (theirs.some((t) => sameValue(a, t.fields.get(field), abs, rel))) continue;
    const covering = allow.find(([, al]) =>
      theirs.some((t) => al.allows({ field, actual: a, expected: t.fields.get(field), clones: { actual: myClones, expected: t.clones } })),
    );
    if (covering) {
      allowed.add(covering[0]);
      continue;
    }
    const expected = theirs.map((t) => ({ frame: t.frame, value: t.fields.get(field) }));
    const b = (theirs.find((t) => t.frame === at.frame) ?? theirs[0]!).fields.get(field);
    const mismatch: Mismatch = { frame: actual.frame, field, actual: a, expected, window: [window[0]!.frame, window[window.length - 1]!.frame] };
    if (Array.isArray(a) && Array.isArray(b)) {
      let i = 0;
      while (i < a.length && i < b.length && sameValue(a[i], b[i], abs, rel)) i++;
      mismatch.index = i;
    }
    return mismatch;
  }
  return null;
}

/** Runs both engines in lockstep and compares them at checkpoints (`CompareConfig`). */
export async function compareEngines(actual: LockstepEngine, expected: LockstepEngine, options: CompareOptions): Promise<CompareResult> {
  checkConfig(
    Object.fromEntries(Object.entries(options).filter(([k]) => ["every", "window", "tolerance", "allow", "ignore"].includes(k))),
    "options",
  );
  const every = options.every ?? 10;
  const k = options.window ?? 2;
  const { events, lastFrame } = schedule(options.input ?? []);
  const engines = [actual, expected] as const;
  const answers = engines.map(() => [] as string[]);
  const allowed = new Set<string>();
  const isCheckpoint = (f: number) => f % every === 0 || f === options.frames;
  const nearCheckpoint = (f: number) => {
    for (let d = -k; d <= k; d++) if (f + d >= 0 && isCheckpoint(f + d)) return true;
    return false;
  };
  // TurboWarp's snapshots near a checkpoint not yet compared, and Bytecat's at those checkpoints.
  const theirs = new Map<number, Snapshot>();
  const pending: Snapshot[] = [];
  let checkpoints = 0;
  let frame = 0;
  const result = (mismatch: Mismatch | null, extra: string[] = []): CompareResult => ({
    frames: frame,
    checkpoints,
    mismatch,
    allowed: [...allowed].sort(),
    problems: [...actual.problems, ...expected.problems, ...extra],
    running: { actual: actual.running, expected: expected.running },
  });
  /** Compares the checkpoints whose window has been run; at the end, all of them. */
  const settle = (end: boolean): Mismatch | null => {
    while (pending.length > 0 && (end || pending[0]!.frame + k <= frame)) {
      const mine = pending.shift()!;
      const window: Snapshot[] = [];
      for (let f = Math.max(0, mine.frame - k); f <= mine.frame + k; f++) {
        // After the end every engine has stopped (or the frame limit is reached), so its last
        // snapshot stands for the frames after it.
        const s = theirs.get(Math.min(f, frame));
        if (s && !window.includes(s)) window.push(s);
      }
      checkpoints++;
      const m = compareCheckpoint(mine, window, options, allowed);
      if (m) return m;
      for (const f of theirs.keys()) if (f < (pending[0]?.frame ?? frame) - k) theirs.delete(f);
    }
    return null;
  };

  pending.push(actual.snapshot(0));
  theirs.set(0, expected.snapshot(0));
  let next = 0;
  let done = false;
  for (frame = 1; frame <= options.frames && !done; frame++) {
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
      frame--;
      return result(null, [`${e instanceof Error ? e.stack ?? e.message : String(e)}`]);
    }
    done = (options.untilDone ?? true) && frame >= lastFrame && !actual.running && !expected.running;
    if (done || nearCheckpoint(frame)) theirs.set(frame, expected.snapshot(frame));
    if (done || isCheckpoint(frame)) pending.push(actual.snapshot(frame));
    const m = settle(false);
    if (m) return result(m);
  }
  frame = Math.min(frame - 1, options.frames);
  const m = settle(true);
  if (m) return result(m);
  // Both engines must agree on whether the project finished.
  if (actual.running !== expected.running) {
    return result({
      frame,
      field: "running",
      actual: String(actual.running),
      expected: [{ frame, value: String(expected.running) }],
      window: [frame, frame],
    });
  }
  return result(null);
}

const show = (v: FieldValue | undefined) => (v === undefined ? "<missing>" : JSON.stringify(v));

/** One line for a mismatch: the path, both values and the frame window. */
export function describeMismatch(m: Mismatch, actualName = "bytecat", expectedName = "turbowarp"): string {
  const at = m.expected.find((e) => e.frame === m.frame) ?? m.expected[m.expected.length - 1];
  const theirs = at?.value;
  let where = m.field;
  let mine: string = show(m.actual);
  let other: string = show(theirs);
  if (m.index !== undefined && Array.isArray(m.actual) && Array.isArray(theirs)) {
    where = `${m.field}[${m.index + 1}]`;
    mine = `${show(m.actual[m.index])} (length ${m.actual.length})`;
    other = `${show(theirs[m.index])} (length ${theirs.length})`;
  }
  const [from, to] = m.window;
  const seen = [...new Set(m.expected.map((e) => show(e.value)))];
  const window = from === to ? "" : `; no match in frames ${from}..${to}, where ${expectedName} had ${seen.slice(0, 4).join(", ")}${seen.length > 4 ? ", ..." : ""}`;
  return `frame ${m.frame}, ${where}: ${actualName} ${mine} but ${expectedName} ${other}${at && at.frame !== m.frame ? ` (at frame ${at.frame})` : ""}${window}`;
}

/** A readable report: agreement, or the first mismatch. */
export function describeCompare(r: CompareResult): string {
  const lines: string[] = [];
  for (const p of r.problems) lines.push(`problem: ${p}`);
  if (r.mismatch) {
    lines.push(`first mismatch at ${describeMismatch(r.mismatch)}`);
  } else {
    const state = r.running.actual || r.running.expected ? "still running" : "every script finished";
    lines.push(`agree at ${r.checkpoints} checkpoint(s) over ${r.frames} frame(s) (${state})`);
  }
  if (r.allowed.length) lines.push(`allowed: ${r.allowed.map((n) => `${n} (${ALLOWANCES[n]!.why})`).join("; ")}`);
  return lines.join("\n");
}

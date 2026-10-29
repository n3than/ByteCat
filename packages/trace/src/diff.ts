// Compares two snapshots field by field and reports the first difference, the way the fuzzer
// reports the first differing log line. No Node imports (see snapshot.ts).
import type { FieldValue, Snapshot } from "./snapshot.js";

export interface FieldDiff {
  frame: number;
  field: string;
  /** For a list field: the 0-based index of the first differing item. */
  index?: number;
  /** The field (or list item) in the engine under test; undefined when it has none. */
  actual: string | undefined;
  /** The same in the oracle. */
  expected: string | undefined;
  /** For a list field: both lengths. */
  lengths?: [actual: number, expected: number];
}

function same(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (typeof a === "string" || typeof b === "string" || a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * The first field that differs, in the order of `actual`'s fields followed by fields only
 * `expected` has, or null when both show the same.
 */
export function diffSnapshots(actual: Snapshot, expected: Snapshot): FieldDiff | null {
  const keys = new Set([...Object.keys(actual.fields), ...Object.keys(expected.fields)]);
  for (const field of keys) {
    const a = actual.fields[field];
    const b = expected.fields[field];
    if (same(a, b)) continue;
    const frame = actual.frame;
    if (Array.isArray(a) && Array.isArray(b)) {
      let index = 0;
      while (a[index] === b[index]) index++;
      return { frame, field, index, actual: a[index], expected: b[index], lengths: [a.length, b.length] };
    }
    const show = (v: FieldValue | undefined) => (v === undefined || typeof v === "string" ? v : JSON.stringify(v));
    return { frame, field, actual: show(a), expected: show(b) };
  }
  return null;
}

/** "frame 12, Cat.x: bytecat "40" but turbowarp "20"" with the engines' names. */
export function describeDiff(d: FieldDiff, actualName = "bytecat", expectedName = "turbowarp"): string {
  const show = (v: string | undefined) => (v === undefined ? "<missing>" : JSON.stringify(v));
  const where = d.index === undefined ? d.field : `${d.field}[${d.index + 1}]`;
  const lengths = d.lengths ? ` (lengths ${d.lengths[0]} and ${d.lengths[1]})` : "";
  return `frame ${d.frame}, ${where}: ${actualName} ${show(d.actual)} but ${expectedName} ${show(d.expected)}${lengths}`;
}

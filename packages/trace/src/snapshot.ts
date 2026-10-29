// What a frame shows, in one format for every engine and driver. An engine adapter reports raw
// state (`StageState`); `toSnapshot` turns it into named display fields, so every engine's values
// are normalized by the same code. This file has no Node imports: a browser-side driver (the
// renderer oracle) can produce the same snapshots.
//
// To compare something new (clones, effects, volume, pen, monitors), add it to `TargetState`, fill it
// in both adapters (bytecat.ts and turbowarp.ts), and add its fields in `toSnapshot`.

/** A field is one display string, or a list of them (a Scratch list). */
export type FieldValue = string | readonly string[];

/** The visible state after one frame. Fields keep a fixed order: the stage, then sprites. */
export interface Snapshot {
  /** 0 is the state after loading and the green flag, before any frame ran. */
  frame: number;
  fields: Record<string, FieldValue>;
}

export interface TargetState {
  name: string;
  isStage: boolean;
  /** Variables and lists by name, in the order the target declares them. */
  variables: [name: string, value: unknown][];
  lists: [name: string, items: readonly unknown[]][];
  /** 0-based costume (or backdrop) index and its name. */
  costume: number;
  costumeName: string;
  /** Sprites only. */
  x?: number;
  y?: number;
  direction?: number;
  size?: number;
  visible?: boolean;
  rotationStyle?: string;
  bubble?: { kind: string; text: string } | null;
}

export interface StageState {
  /** The stage first, then the sprites, then the clones (labelled by `cloneLabels`). */
  targets: TargetState[];
  /** Sprite names from the back layer to the front. */
  layers: string[];
}

/**
 * The name each target is shown under: an original's own name, and for a clone its sprite's name
 * and its place among that sprite's clones, in the order the engine lists them (`Cat#1`, `Cat#2`).
 * Both engines list targets in the order they were made, so the same clone gets the same label.
 */
export function cloneLabels<T>(targets: readonly T[], name: (t: T) => string, isOriginal: (t: T) => boolean): Map<T, string> {
  const labels = new Map<T, string>();
  const counts = new Map<string, number>();
  for (const t of targets) {
    const n = name(t);
    if (isOriginal(t)) {
      labels.set(t, n);
      continue;
    }
    const k = (counts.get(n) ?? 0) + 1;
    counts.set(n, k);
    labels.set(t, `${n}#${k}`);
  }
  return labels;
}

/** A value as Scratch shows it in a monitor or a `say` of the reporter: numbers and text alike. */
export function display(value: unknown): string {
  return String(value);
}

/**
 * A coordinate as the x and y position reporters give it: TurboWarp hides floating-point noise
 * within 1e-9 of a whole number (`limitPrecision`).
 */
export function displayCoordinate(n: number): string {
  const rounded = Math.round(n);
  return display(Math.abs(n - rounded) < 1e-9 ? rounded : n);
}

export function toSnapshot(frame: number, state: StageState): Snapshot {
  const fields: Record<string, FieldValue> = {};
  for (const t of state.targets) {
    const p = `${t.name}.`;
    fields[p + "costume"] = `${t.costume + 1} ${t.costumeName}`;
    if (!t.isStage) {
      fields[p + "x"] = displayCoordinate(t.x!);
      fields[p + "y"] = displayCoordinate(t.y!);
      fields[p + "direction"] = display(t.direction);
      fields[p + "size"] = display(t.size);
      fields[p + "visible"] = display(t.visible);
      fields[p + "rotationStyle"] = display(t.rotationStyle);
      fields[p + "bubble"] = t.bubble && t.bubble.text !== "" ? `${t.bubble.kind}: ${t.bubble.text}` : "";
    }
    for (const [name, value] of t.variables) fields[`${p}var.${name}`] = display(value);
    for (const [name, items] of t.lists) fields[`${p}list.${name}`] = items.map(display);
  }
  fields.layers = state.layers;
  return { frame, fields };
}

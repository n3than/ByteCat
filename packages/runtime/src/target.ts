import type { ProjectJson, Target as TargetJson } from "@bytecat/sb3";
import type { Value } from "./ops.js";

export interface CostumeInfo {
  name: string;
  md5ext: string;
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution: number;
}

/**
 * Live state of the stage, a sprite or a clone of a sprite. Generated code reads `v` (variables)
 * and `l` (lists) directly.
 */
export class Target {
  readonly name: string;
  readonly isStage: boolean;
  /** The index of its sprite (or the stage) in `project.targets`, the same for every clone. */
  readonly index: number;
  /** False for a clone made by `create clone`. */
  readonly isOriginal: boolean;
  readonly v: Record<string, Value> = {};
  readonly l: Record<string, Value[]> = {};
  readonly costumes: CostumeInfo[];
  costume: number;
  x = 0;
  y = 0;
  direction = 90;
  size = 100;
  visible = true;
  /** The drawing order: a target with a higher layer is drawn in front. No two are equal. */
  layer: number;
  rotationStyle = "all around";
  draggable = false;
  /** Graphic effects by name; no block sets them yet, but a clone copies them. */
  effects: Record<string, number> = {};
  /** Current speech bubble, or null. */
  bubble: { kind: "say" | "think"; text: string } | null = null;
  /** Whether a renderer would have the bubble drawn: it appeared on a visible sprite and is still up. */
  bubbleDrawn = false;

  /** The target at `index` in project.json, or given a target, a clone of it. */
  constructor(source: TargetJson | Target, index = 0) {
    if (source instanceof Target) {
      const parent = source;
      // What TurboWarp's `makeClone` copies; the bubble and the threads stay behind.
      this.name = parent.name;
      this.isStage = false;
      this.index = parent.index;
      this.isOriginal = false;
      for (const id in parent.v) this.v[id] = parent.v[id]!;
      for (const id in parent.l) this.l[id] = [...parent.l[id]!];
      this.costumes = parent.costumes;
      this.costume = parent.costume;
      this.layer = parent.layer;
      this.x = parent.x;
      this.y = parent.y;
      this.direction = parent.direction;
      this.size = parent.size;
      this.visible = parent.visible;
      this.rotationStyle = parent.rotationStyle;
      this.draggable = parent.draggable;
      this.effects = { ...parent.effects };
      return;
    }
    const json = source;
    this.name = json.name;
    this.isStage = json.isStage;
    this.index = index;
    this.isOriginal = true;
    for (const [id, [, value]] of Object.entries(json.variables)) this.v[id] = value;
    for (const [id, [, items]] of Object.entries(json.lists)) this.l[id] = [...items];
    this.costumes = json.costumes.map((c) => ({
      name: c.name,
      md5ext: c.md5ext,
      rotationCenterX: c.rotationCenterX,
      rotationCenterY: c.rotationCenterY,
      bitmapResolution: c.bitmapResolution ?? 1,
    }));
    this.costume = json.currentCostume;
    this.layer = json.layerOrder;
    if (!json.isStage) {
      this.x = json.x;
      this.y = json.y;
      this.direction = json.direction;
      this.size = json.size;
      this.visible = json.visible;
      this.rotationStyle = json.rotationStyle;
      this.draggable = json.draggable;
    }
  }

  /**
   * Every target of the project, in project order. Their layers are renumbered 0, 1, 2, ... from
   * back to front, the stage first and ties in project order, so that every layer is distinct
   * and a clone can be slotted in just behind its parent.
   */
  static all(project: ProjectJson): Target[] {
    const targets = project.targets.map((t, i) => new Target(t, i));
    const byLayer = [...targets].sort((a, b) => Number(b.isStage) - Number(a.isStage) || a.layer - b.layer || a.index - b.index);
    byLayer.forEach((t, i) => (t.layer = i));
    return targets;
  }
}

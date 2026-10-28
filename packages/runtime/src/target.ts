import type { ProjectJson, Target as TargetJson } from "@bytecat/sb3";
import type { Value } from "./ops.js";

export interface CostumeInfo {
  name: string;
  md5ext: string;
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution: number;
}

/** Live state of the stage or a sprite. Generated code reads `v` (variables) and `l` (lists) directly. */
export class Target {
  readonly name: string;
  readonly isStage: boolean;
  readonly v: Record<string, Value> = {};
  readonly l: Record<string, Value[]> = {};
  readonly costumes: CostumeInfo[];
  costume: number;
  x = 0;
  y = 0;
  direction = 90;
  size = 100;
  visible = true;
  layer: number;
  rotationStyle = "all around";
  /** Current speech bubble, or null. */
  bubble: { kind: "say" | "think"; text: string } | null = null;
  /** Whether a renderer would have the bubble drawn: it appeared on a visible sprite and is still up. */
  bubbleDrawn = false;

  constructor(json: TargetJson) {
    this.name = json.name;
    this.isStage = json.isStage;
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
    }
  }

  static all(project: ProjectJson): Target[] {
    return project.targets.map((t) => new Target(t));
  }
}

// Types for the subset of the Scratch 3 project.json format that Bytecat reads and writes.
// Reference: https://en.scratch-wiki.info/wiki/Scratch_File_Format

/** Compact primitive codes used inside block inputs. */
export const Primitive = {
  Number: 4,
  PositiveNumber: 5,
  WholeNumber: 6,
  Integer: 7,
  Angle: 8,
  Color: 9,
  Text: 10,
  Broadcast: 11,
  Variable: 12,
  List: 13,
} as const;
export type PrimitiveCode = (typeof Primitive)[keyof typeof Primitive];

/** Input shadow states: 1 = shadow only, 2 = block without shadow, 3 = block covering a shadow. */
export const InputState = { Shadow: 1, NoShadow: 2, Obscured: 3 } as const;

/** A compact primitive, e.g. `[4, "10"]` or `[12, "score", "varId"]`. */
export type CompactPrimitive =
  | [code: 4 | 5 | 6 | 7 | 8 | 9 | 10, value: string]
  | [code: 11 | 12 | 13, name: string, id: string];

/** Either a block id or an inline compact primitive. */
export type InputValue = string | CompactPrimitive | null;

export type Input =
  | [state: 1, shadow: InputValue]
  | [state: 2, block: InputValue]
  | [state: 3, block: InputValue, shadow: InputValue];

export type Field = [value: string, id: string | null] | [value: string];

export interface Mutation {
  tagName: "mutation";
  children: [];
  proccode?: string;
  argumentids?: string;
  argumentnames?: string;
  argumentdefaults?: string;
  warp?: string;
  hasnext?: string;
}

export interface Block {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, Input>;
  fields: Record<string, Field>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: Mutation;
}

export interface Costume {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: "svg" | "png";
  bitmapResolution?: number;
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface Sound {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: "wav" | "mp3";
  rate: number;
  sampleCount: number;
}

export type ScalarValue = string | number | boolean;

interface TargetBase {
  name: string;
  variables: Record<string, [name: string, value: ScalarValue]>;
  lists: Record<string, [name: string, value: ScalarValue[]]>;
  broadcasts: Record<string, string>;
  blocks: Record<string, Block>;
  comments: Record<string, unknown>;
  currentCostume: number;
  costumes: Costume[];
  sounds: Sound[];
  volume: number;
  layerOrder: number;
}

export interface StageTarget extends TargetBase {
  isStage: true;
  tempo: number;
  videoTransparency: number;
  videoState: "on" | "off" | "on-flipped";
  textToSpeechLanguage: string | null;
}

export interface SpriteTarget extends TargetBase {
  isStage: false;
  visible: boolean;
  x: number;
  y: number;
  size: number;
  direction: number;
  draggable: boolean;
  rotationStyle: "all around" | "left-right" | "don't rotate";
}

export type Target = StageTarget | SpriteTarget;

export interface ProjectJson {
  targets: [StageTarget, ...SpriteTarget[]];
  monitors: unknown[];
  extensions: string[];
  meta: { semver: string; vm: string; agent: string };
}

/** A project.json plus the asset files it references, keyed by md5ext. */
export interface Project {
  json: ProjectJson;
  assets: Map<string, Uint8Array>;
}

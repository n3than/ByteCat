import type { CompactPrimitive } from "@bytecat/sb3";

/** A declared variable, list or broadcast: its project-wide id and its name. */
export interface Symbol {
  id: string;
  name: string;
}

export interface Procedure {
  name: string;
  proccode: string;
  argumentIds: string[];
  params: { name: string; boolean: boolean }[];
  warp: boolean;
}

/** The result of lowering an expression: an inline primitive or a reporter block. */
export type Value =
  | { kind: "prim"; prim: CompactPrimitive; bool: false }
  | { kind: "block"; id: string; bool: boolean };

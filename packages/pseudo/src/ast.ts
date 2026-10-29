import type { SourcePos } from "./errors.js";

export interface ProgramNode {
  globals: Declaration[];
  targets: TargetNode[];
}

export interface TargetNode {
  kind: "stage" | "sprite";
  name: string;
  pos: SourcePos;
  declarations: Declaration[];
  properties: Property[];
  scripts: ScriptNode[];
}

export type Declaration =
  | { kind: "var"; name: string; value: Literal; pos: SourcePos }
  | { kind: "list"; name: string; items: Literal[]; pos: SourcePos }
  | { kind: "costume"; name: string; shape: string; color?: string; pos: SourcePos };

export type Property =
  | { kind: "position"; x: number; y: number; pos: SourcePos }
  | { kind: "size"; value: number; pos: SourcePos }
  | { kind: "direction"; value: number; pos: SourcePos }
  | { kind: "hidden"; pos: SourcePos };

export type Hat =
  | { kind: "flag" }
  | { kind: "clicked" }
  | { kind: "cloned" }
  | { kind: "key"; key: string }
  | { kind: "receive"; message: string };

export interface Param {
  name: string;
  boolean: boolean;
}

export type ScriptNode =
  | { kind: "when"; hat: Hat; body: Stmt[]; pos: SourcePos }
  | { kind: "define"; name: string; params: Param[]; warp: boolean; body: Stmt[]; pos: SourcePos };

export type Stmt =
  | { kind: "assign"; target: string; op: "=" | "+=" | "-=" | "*=" | "/="; value: Expr; pos: SourcePos }
  | { kind: "setItem"; list: string; index: Expr; value: Expr; pos: SourcePos }
  | { kind: "call"; callee: string; args: Expr[]; pos: SourcePos }
  | { kind: "method"; object: string; method: string; args: Expr[]; pos: SourcePos }
  | { kind: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null; pos: SourcePos }
  | { kind: "repeat"; count: Expr; body: Stmt[]; pos: SourcePos }
  | { kind: "forever"; body: Stmt[]; pos: SourcePos }
  | { kind: "allAtOnce"; body: Stmt[]; pos: SourcePos }
  | { kind: "until"; cond: Expr; body: Stmt[]; pos: SourcePos }
  | { kind: "while"; cond: Expr; body: Stmt[]; pos: SourcePos }
  | { kind: "for"; variable: string; from: Expr; to: Expr; body: Stmt[]; pos: SourcePos };

export type Literal = { kind: "number"; value: string } | { kind: "string"; value: string };

export type Expr =
  | (Literal & { pos: SourcePos })
  | { kind: "bool"; value: boolean; pos: SourcePos }
  | { kind: "name"; name: string; pos: SourcePos }
  | { kind: "call"; callee: string; args: Expr[]; pos: SourcePos }
  | { kind: "index"; list: string; index: Expr; pos: SourcePos }
  | { kind: "member"; object: string; member: string; args: Expr[] | null; pos: SourcePos }
  | { kind: "unary"; op: "-" | "not"; operand: Expr; pos: SourcePos }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr; pos: SourcePos };

export type BinaryOp =
  | "+" | "-" | "*" | "/" | "%"
  | "<" | ">" | "=" | "!=" | "<=" | ">="
  | "and" | "or";

import type { Block, Target } from "@bytecat/sb3";

/** Static type of a generated expression, used to skip casts that cannot change the value. */
export type Type = "num" | "str" | "bool" | "any";

/** A generated JavaScript expression with what the compiler knows about its value. */
export interface Ex {
  c: string; // JavaScript code
  t: Type;
  /** Set when the value is a literal known at compile time. */
  k?: string;
}

export interface Proc {
  fn: string;
  params: string[];
  warp: boolean;
  /** True when the body can never yield, so it compiles to a plain function instead of a generator. */
  sync: boolean;
}

export interface CompileResult {
  /** Source of a `function (rt) { ... }` expression returning the program's hats. */
  code: string;
  /** Blocks the compiler does not support. They compile to no-ops or empty values. */
  warnings: string[];
}

export type FieldRef = [string, string | null] | [string] | undefined;

/**
 * What a block handler may ask of the compiler. Handlers in `blocks/` are pure functions of a
 * block and this interface, so each can be tested with a stub.
 */
export interface Gen {
  /** The target being compiled. */
  readonly target: Target;
  /** The custom block whose body is being compiled; undefined in a hat script. */
  readonly procedure: Proc | undefined;
  /** An input as an expression. Missing inputs are the empty string. */
  input(b: Block, name: string): Ex;
  /** An input cast to a number, string, boolean, or left as is. */
  num(b: Block, name: string): string;
  str(b: Block, name: string): string;
  bool(b: Block, name: string): string;
  any(b: Block, name: string): string;
  /** First value of a field, or the empty string. */
  field(b: Block, name: string): string;
  /** JavaScript reference for a variable or list field. */
  variable(field: FieldRef): string;
  list(field: FieldRef): string;
  /** JavaScript name of a custom block argument, if the name is a parameter of the current procedure. */
  param(name: string): string | undefined;
  /** The custom block with this proccode, if the target defines it. */
  proc(proccode: string | undefined): Proc | undefined;
  /** Compiles the stack starting at a block id. */
  stack(id: string | null | undefined): string[];
  /** Compiles the stack in a substack input, indented one level. */
  substack(b: Block, name: string): string[];
  /** A fresh name for a loop counter. */
  tmp(): string;
  /** The yield at the end of a loop iteration, which a warp procedure never needs. */
  loopYield(): string[];
  /** Marks the code being compiled as able to yield, and returns the statement unchanged. */
  y(line: string): string[];
  /** Marks the code being compiled as able to yield, without emitting anything. */
  markYields(): void;
}

/** Compiles a statement block to lines of JavaScript; undefined means the block is unsupported. */
export type StatementHandler = (b: Block, g: Gen) => string[] | undefined;

/** Compiles a reporter block to an expression; undefined means the block is unsupported. */
export type ReporterHandler = (b: Block, g: Gen) => Ex | undefined;

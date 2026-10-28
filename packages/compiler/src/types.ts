import type { Block, Target } from "@bytecat/sb3";
import type { TypeSet } from "./analysis/typeset.js";

/** A generated JavaScript expression with what the compiler knows about its value. */
export interface Ex {
  c: string; // JavaScript code
  /** Every kind of value the expression can have at runtime (see analysis/typeset.ts). */
  t: TypeSet;
  /** Set when the value is a literal known at compile time. */
  k?: string;
  /** For a boolean expression written as `!x`: the code of `x`, which is its negation (see `notCode`). */
  neg?: string;
  /** Set on a literal that must be passed on as text even when it looks like a number (asset names). */
  text?: boolean;
}

/** The menu values Scratch gives a meaning beyond a name: the mouse pointer, a random position, ... */
export const MENU_SPECIALS = ["_mouse_", "_random_", "_edge_", "_stage_", "_myself_"] as const;
export type MenuSpecial = (typeof MENU_SPECIALS)[number];

/** The value of a menu input (`Gen.menu`). */
export interface MenuEx extends Ex {
  /**
   * Set when the menu is fixed at compile time and names one of the special values, so a handler
   * can emit code for "go to mouse pointer" instead of looking a sprite up by name.
   */
  special?: MenuSpecial;
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
  /** Blocks the compiler does not support, by opcode. They compile to no-ops or empty values. */
  warnings: string[];
  /**
   * Extension ids the project lists in project.json that no registered extension has, sorted.
   * Every block of such an extension is unsupported (and in `warnings`).
   */
  unknownExtensions: string[];
}

export type FieldRef = [string, string | null] | [string] | undefined;

/**
 * What a block handler may ask of the compiler. Handlers in `extensions/` are pure functions of
 * a block and this interface, so each can be tested with a stub.
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
  /**
   * A menu input (costume, sprite, key, broadcast, ...). When the slot holds its shadow menu the
   * value is a literal string (`k`), with `special` set for `_mouse_`, `_random_`, `_edge_`,
   * `_stage_` and `_myself_`; when a reporter was dropped into the slot it is that reporter's
   * expression, computed at run time.
   */
  menu(b: Block, name: string): MenuEx;
  /** First value of a field, or the empty string. */
  field(b: Block, name: string): string;
  /** JavaScript reference for a variable or list field. */
  variable(field: FieldRef): string;
  /** Every type the variable can hold: its initial value and anything assigned anywhere in the project. */
  varType(field: FieldRef): TypeSet;
  /** Records an assignment of a value of this type to the variable. */
  noteWrite(field: FieldRef, type: TypeSet): void;
  /** Every type an item of the list can have: its initial items and anything added anywhere. */
  listType(field: FieldRef): TypeSet;
  /** Records that an item of this type is added to the list or replaces one of its items. */
  noteListWrite(field: FieldRef, type: TypeSet): void;
  list(field: FieldRef): string;
  /** JavaScript name of a custom block argument, if the name is a parameter of the current procedure. */
  param(name: string): string | undefined;
  /** Every type a custom block argument of the current procedure can receive. */
  paramType(name: string): TypeSet;
  /** Records the types of the arguments passed in a call. */
  noteCall(proc: Proc, args: TypeSet[]): void;
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
  /**
   * A line that stores the variables the function keeps in locals back to the target, before code
   * where other scripts, or the given sync procedure, could read them: a yield, a call, an exit.
   */
  store(proc?: Proc): string;
  /** A line that reloads the cached variables after code that may have changed them. */
  load(proc?: Proc): string;
}

/** Compiles a statement block to lines of JavaScript; undefined means the block is unsupported. */
export type StatementHandler = (b: Block, g: Gen) => string[] | undefined;

/** Compiles a reporter block to an expression; undefined means the block is unsupported. */
export type ReporterHandler = (b: Block, g: Gen) => Ex | undefined;

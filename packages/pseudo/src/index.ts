import { writeSb3 } from "@bytecat/sb3";
import { lower, type LowerResult } from "./lower.js";
import { parse } from "./parser.js";

export { parse } from "./parser.js";
export { tokenize } from "./lexer.js";
export { lower, LOG_LIST, type LowerResult } from "./lower.js";
export { PseudoError } from "./errors.js";
export type * from "./ast.js";

/** Compiles pseudocode source into a Scratch project. Throws PseudoError on bad input. */
export function compile(source: string, file?: string): LowerResult {
  return lower(parse(source, file), file);
}

/** Compiles pseudocode source straight to .sb3 bytes. */
export function compileToSb3(source: string, file?: string): Uint8Array {
  return writeSb3(compile(source, file).project);
}

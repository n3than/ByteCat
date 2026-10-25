/**
 * Assembles the final program text from the pieces each target produced: the prelude (variables
 * the project uses but never declares), procedure functions, and hat scripts.
 */
export function emitProgram(parts: { prelude: string[]; procedures: string[]; hats: string[] }): string {
  return [
    "(function (rt) {",
    '"use strict";',
    "const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,",
    "  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;",
    "const S = rt.stage;",
    ...parts.prelude,
    ...parts.procedures,
    "return [",
    ...parts.hats.map((h) => h + ","),
    "];",
    "})",
  ].join("\n");
}

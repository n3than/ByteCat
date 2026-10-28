/**
 * The runtime features the code generator itself emits, outside any block's spec: the program
 * prelude (`rt.ops`, `rt.stage`), the casts every input may get (`toNum`, `toStr`, `toBool`,
 * `cast.ts`), the loop yield (`rt.spin`, `TargetCodegen.loopYield`) and the contents of a list
 * dropped into an input (`listContents`, `TargetCodegen.primitive`). Together with the `uses` of
 * the blocks a project contains, these are every runtime function its program calls
 * (`tests/uses.test.ts`).
 */
export const CODEGEN_USES: readonly string[] = ["ops", "stage", "toNum", "toStr", "toBool", "spin", "listContents"];

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

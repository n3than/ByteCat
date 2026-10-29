import type { ProgramFactory } from "@bytecat/runtime";
import { RUNTIME_MODULES } from "@bytecat/runtime/modules";
import type { ProjectJson } from "@bytecat/sb3";
import { compileProject, type CompileOptions, type CompileResult } from "./codegen.js";
import { toScript } from "./emit.js";
import type { RuntimeImport } from "./types.js";

export { compileProject, type CompileOptions, type CompileResult } from "./codegen.js";
export * from "./extensions/index.js";
export { CODEGEN_USES, OPS_MODULE, referencedNames, toModule, toScript } from "./emit.js";
export {
  MENU_SPECIALS,
  type Ex,
  type FieldRef,
  type Gen,
  type MenuEx,
  type MenuSpecial,
  type Proc,
  type ReporterHandler,
  type RuntimeImport,
  type StatementHandler,
} from "./types.js";
// For extension handlers: literals, typed expressions and the casts that skip what types prove.
export { anyEx, asAny, asBool, asName, asNum, asStr, boolEx, lit, menuLiteral, numEx, strEx } from "./cast.js";

/** Runtime modules by specifier, as a program imports them. */
export type RuntimeModules = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * Turns generated code into a callable program factory, binding its imports to the built-in
 * runtime modules and to `modules`, which a third-party extension's `runtime` module comes from.
 */
export function load(result: { code: string; imports: readonly RuntimeImport[] }, modules: RuntimeModules = {}): ProgramFactory {
  const all = { ...RUNTIME_MODULES, ...modules };
  for (const { from, names } of result.imports) {
    const m = all[from];
    if (!m) throw new Error(`the program imports from ${from}; pass that module to load()`);
    for (const name of names) if (!(name in m)) throw new Error(`the program imports ${name}, which ${from} does not export`);
  }
  return (new Function(`return ${toScript(result)};`)() as (m: RuntimeModules) => ProgramFactory)(all);
}

/** Compiles a project and loads it in one step; `modules` as for `load`. */
export function compile(
  project: ProjectJson,
  options: CompileOptions & { modules?: RuntimeModules } = {},
): CompileResult & { program: ProgramFactory } {
  const result = compileProject(project, options);
  return { ...result, program: load(result, options.modules) };
}

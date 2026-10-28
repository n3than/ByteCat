import type { ProjectJson } from "@bytecat/sb3";
import { TypeEnv } from "./analysis/env.js";
import { emitProgram } from "./emit.js";
import { builtins, type Extension } from "./extensions/index.js";
import type { ExtensionRegistry } from "./extensions/registry.js";
import { TargetCodegen } from "./target.js";
import type { CompileResult } from "./types.js";

export type { CompileResult } from "./types.js";

export interface CompileOptions {
  /**
   * Extensions to compile with, besides the built-in ones (see docs/extensions.md). Their ids
   * and opcodes must not clash with the built-in ones.
   */
  extensions?: readonly Extension[];
}

/** Compiles every script in a project into one JavaScript factory function. */
export function compileProject(project: ProjectJson, options: CompileOptions = {}): CompileResult {
  const registry = builtins.with(options.extensions ?? []);
  const env = new TypeEnv(project);
  // Each pass compiles with the types the previous one found, until the types stop growing; the
  // last pass's code relies only on types that every assignment in it respects.
  for (;;) {
    const result = compilePass(project, env, registry);
    if (!env.settle()) return result;
  }
}

function compilePass(project: ProjectJson, env: TypeEnv, registry: ExtensionRegistry): CompileResult {
  const procedures: string[] = [];
  const hats: string[] = [];
  const warnings = new Set<string>();
  const prelude: string[] = [];
  const stage = project.targets[0];
  // Every costume, backdrop and sound name in the project (see TargetCodegen.any).
  const assetNames = new Set<string>();
  for (const target of project.targets) {
    for (const asset of [...(target.costumes ?? []), ...(target.sounds ?? [])]) assetNames.add(asset.name);
  }

  project.targets.forEach((target, index) => {
    const gen = new TargetCodegen(target, index, stage, warnings, prelude, env, assetNames, registry);
    procedures.push(...gen.procedures());
    hats.push(...gen.hats());
  });

  // project.json lists the non-core extensions the project uses; one no registry knows means
  // every block of it is unsupported, and the project most likely will not work.
  const unknownExtensions = [...new Set(project.extensions ?? [])].filter((id) => !registry.has(id)).sort();
  return { code: emitProgram({ prelude, procedures, hats }), warnings: [...warnings].sort(), unknownExtensions };
}

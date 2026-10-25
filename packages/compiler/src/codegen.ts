import type { ProjectJson } from "@bytecat/sb3";
import { emitProgram } from "./emit.js";
import { TargetCodegen } from "./target.js";
import type { CompileResult } from "./types.js";

export type { CompileResult } from "./types.js";

/** Compiles every script in a project into one JavaScript factory function. */
export function compileProject(project: ProjectJson): CompileResult {
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
    const gen = new TargetCodegen(target, index, stage, warnings, prelude, assetNames);
    procedures.push(...gen.procedures());
    hats.push(...gen.hats());
  });

  return { code: emitProgram({ prelude, procedures, hats }), warnings: [...warnings].sort() };
}

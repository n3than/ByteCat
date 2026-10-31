// Sidecar files for the relaxed comparison, so a folder of projects needs no test code: next to
// `NAME.sb3` (or `NAME.sbp`), `NAME.input` is its scripted input and `NAME.compare.json` its
// `CompareConfig`. Both are optional. Used by `bytecat compare` and by tests.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { checkConfig, type CompareConfig, type CompareOptions, type CompareResult } from "./compare.js";
import { parseInput, type Command } from "./input.js";
import { compareProject } from "./project.js";

export interface ProjectFiles {
  /** The file name without its extension. */
  name: string;
  /** The project: an .sb3, or an .sbp the caller compiles. */
  path: string;
  /** From `NAME.input`, or empty. */
  input: Command[];
  /** From `NAME.compare.json`, or empty. */
  config: CompareConfig;
}

const stem = (path: string) => path.slice(0, path.length - extname(path).length);

/** Reads `NAME.compare.json` next to a project, or returns `{}` when there is none. */
export function readCompareConfig(path: string): CompareConfig {
  const file = `${stem(path)}.compare.json`;
  if (!existsSync(file)) return {};
  let config: CompareConfig;
  try {
    config = JSON.parse(readFileSync(file, "utf8")) as CompareConfig;
  } catch (e) {
    throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  checkConfig(config, file);
  return config;
}

/** A project and its sidecar files. */
export function projectFiles(path: string): ProjectFiles {
  const inputPath = `${stem(path)}.input`;
  return {
    name: basename(stem(path)),
    path,
    input: existsSync(inputPath) ? parseInput(readFileSync(inputPath, "utf8"), inputPath) : [],
    config: readCompareConfig(path),
  };
}

/** Every project with one of `extensions` in `dir` (not its subfolders), sorted by name; none if `dir` is missing. */
export function projectsIn(dir: string, extensions: readonly string[] = [".sb3"]): ProjectFiles[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => extensions.includes(extname(f)))
    .sort()
    .map((f) => projectFiles(join(dir, f)));
}

/**
 * Compares an .sb3 file with TurboWarp, with its sidecar input and config (300 frames unless the
 * options say otherwise). `options` overrides them; an explicit `input` replaces the sidecar's.
 */
export function compareFile(path: string, options: Partial<CompareOptions> = {}): Promise<CompareResult> {
  const p = projectFiles(path);
  return compareProject(readFileSync(path), { frames: 300, input: p.input, ...p.config, ...options });
}

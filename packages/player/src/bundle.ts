// Node side: builds one self-contained HTML file (player, compiled program, project and assets).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Metafile, type Plugin } from "esbuild";
import type { Project } from "@bytecat/sb3";
import { pageHtml } from "./page.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

let playerScript: Promise<string> | null = null;

/**
 * The full browser player as one minified script, built once per process: it carries every
 * runtime module and runs the program the page gives it as `toScript` writes it. For pages built
 * where no bundler runs (the web app's download); `bundleHtml` builds a smaller script per project.
 */
export function playerBundle(): Promise<string> {
  playerScript ??= build({
    entryPoints: [here("./main.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    target: "es2022",
    platform: "browser",
  }).then((r) => r.outputFiles[0]!.text);
  return playerScript;
}

export interface ProgramBundle {
  /** The player and the program as one script. */
  script: string;
  /** What esbuild put in it: each source file with the bytes it contributes (`bytesInOutput`). */
  inputs: Metafile["outputs"][string]["inputs"];
}

/**
 * The player and one program as a single script. `programModule` is the program as `toModule` (in
 * @bytecat/compiler) writes it; esbuild resolves its imports and leaves out every runtime module,
 * and every function in one, that the program does not reach. `minify: false` keeps the names,
 * for tests that look for a function.
 */
export async function programBundle(programModule: string, options: { minify?: boolean } = {}): Promise<ProgramBundle> {
  const program: Plugin = {
    name: "bytecat-program",
    setup(b) {
      b.onResolve({ filter: /^bytecat:program$/ }, () => ({ path: "program.js", namespace: "bytecat" }));
      // The program's imports resolve from this package, which depends on @bytecat/runtime.
      b.onLoad({ filter: /.*/, namespace: "bytecat" }, () => ({ contents: programModule, loader: "js", resolveDir: dirname(here("./bundle.ts")) }));
    },
  };
  const r = await build({
    stdin: {
      contents: `import program from "bytecat:program";\nimport { start } from ${JSON.stringify(here("./start.ts"))};\nstart(program);\n`,
      resolveDir: dirname(here("./bundle.ts")),
      loader: "js",
    },
    bundle: true,
    format: "iife",
    minify: options.minify ?? true,
    write: false,
    metafile: true,
    target: "es2022",
    platform: "browser",
    plugins: [program],
  });
  const output = Object.values(r.metafile.outputs)[0]!;
  return { script: r.outputFiles[0]!.text, inputs: output.inputs };
}

/**
 * The standalone page for a project: the player and the program in one script that ships only the
 * runtime modules the program imports. `programModule` as for `programBundle`.
 */
export async function bundleHtml(project: Project, programModule: string, title = "Bytecat"): Promise<string> {
  return pageHtml(project, undefined, (await programBundle(programModule)).script, title);
}

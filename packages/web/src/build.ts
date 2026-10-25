// Node side: builds the web app into one self-contained HTML file.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { playerBundle } from "@bytecat/player/bundle";

export interface Sample {
  name: string;
  source: string;
}

export interface WebAppOptions {
  /** Directories whose .sbp files become the samples menu, in order. */
  sampleDirs?: string[];
}

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The default samples: the welcome project, then every example. */
export const DEFAULT_SAMPLE_DIRS = [here("../samples"), here("../../../examples")];

/** Every .sbp in the given directories, sorted by name within each directory. */
export function loadSamples(dirs = DEFAULT_SAMPLE_DIRS): Sample[] {
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".sbp"))
      .sort()
      .map((f) => ({ name: basename(f, ".sbp"), source: readFileSync(join(dir, f), "utf8") })),
  );
}

/** Makes text safe to place inside an inline <script>. */
function scriptSafe(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

export async function buildWebApp(options: WebAppOptions = {}): Promise<string> {
  const result = await build({
    entryPoints: [here("./app.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    target: "es2022",
    platform: "browser",
    define: {
      __PLAYER_SCRIPT__: JSON.stringify(await playerBundle()),
      __SAMPLES__: JSON.stringify(loadSamples(options.sampleDirs)),
    },
  });
  const script = scriptSafe(result.outputFiles[0]!.text);
  const css = readFileSync(here("./app.css"), "utf8");
  return readFileSync(here("./app.html"), "utf8")
    .replace("/*STYLE*/", () => css)
    .replace("<!--SCRIPT-->", () => `<script>${script}</script>`);
}

// Node side: builds one self-contained HTML file (player, compiled program, project and assets).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Project } from "@bytecat/sb3";
import { pageHtml } from "./page.js";

let playerScript: Promise<string> | null = null;

/** The browser player as one minified script, built once per process. */
export function playerBundle(): Promise<string> {
  playerScript ??= build({
    entryPoints: [fileURLToPath(new URL("./main.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    target: "es2022",
    platform: "browser",
  }).then((r) => r.outputFiles[0]!.text);
  return playerScript;
}

export async function bundleHtml(project: Project, programCode: string, title = "Bytecat"): Promise<string> {
  return pageHtml(project, programCode, await playerBundle(), title);
}

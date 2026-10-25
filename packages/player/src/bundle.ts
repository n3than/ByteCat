// Node side: builds one self-contained HTML file (player, compiled program, project and assets).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Project } from "@bytecat/sb3";

const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg" };

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

function dataUrl(name: string, data: Uint8Array): string {
  const ext = name.split(".").pop() ?? "";
  return `data:${MIME[ext] ?? "application/octet-stream"};base64,${Buffer.from(data).toString("base64")}`;
}

/** Makes text safe to place inside an inline <script>. */
function scriptSafe(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

export async function bundleHtml(project: Project, programCode: string, title = "Bytecat"): Promise<string> {
  const assets = Object.fromEntries([...project.assets].map(([name, data]) => [name, dataUrl(name, data)]));
  const data = `window.BYTECAT = { project: ${JSON.stringify(project.json)}, assets: ${JSON.stringify(assets)}, program: ${programCode} };`;
  const escapedTitle = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: #1e1e2e; font-family: system-ui, sans-serif; }
  #stage { width: min(100vw, 480px); aspect-ratio: 4 / 3; background: #fff; outline: none; }
  .bar { display: flex; gap: 8px; }
  .bar button { font-size: 18px; padding: 4px 12px; cursor: pointer; }
  .bytecat-ask { width: min(100vw, 480px); box-sizing: border-box; font-size: 16px; padding: 6px; }
</style>
</head>
<body>
<div class="bar"><button id="flag" title="Green flag">&#9873;</button><button id="stop" title="Stop">&#9632;</button></div>
<canvas id="stage" width="480" height="360" tabindex="0"></canvas>
<script>${scriptSafe(data)}</script>
<script>${scriptSafe(await playerBundle())}</script>
</body>
</html>
`;
}

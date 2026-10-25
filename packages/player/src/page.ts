// Builds the standalone player page. Works in Node and in the browser (the web app downloads it).
import type { Project } from "@bytecat/sb3";

const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp" };

export function mimeType(name: string): string {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** The project's costume and backdrop images; sounds and stray files are left out. */
export function costumeAssets(project: Project): [string, Uint8Array][] {
  const names = new Set(project.json.targets.flatMap((t) => t.costumes.map((c) => c.md5ext)));
  return [...project.assets].filter(([name]) => names.has(name));
}

function base64(data: Uint8Array): string {
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

function dataUrl(name: string, data: Uint8Array): string {
  return `data:${mimeType(name)};base64,${base64(data)}`;
}

/** Makes text safe to place inside an inline <script>. */
export function scriptSafe(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** One self-contained HTML page: `playerScript` is the bundled browser player (see `playerBundle`). */
export function pageHtml(project: Project, programCode: string, playerScript: string, title = "Bytecat"): string {
  const assets = Object.fromEntries(costumeAssets(project).map(([name, data]) => [name, dataUrl(name, data)]));
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
<script>${scriptSafe(playerScript)}</script>
</body>
</html>
`;
}

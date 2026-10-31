// Node side of the browser oracle: bundles page.ts (TurboWarp's VM and renderer, Bytecat, the
// trace loop) into one HTML file, opens it in Chromium through Playwright and runs traces there.
// See docs/testing.md, "The browser oracle".
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scriptSafe } from "@bytecat/player";
import { scratchBuildOptions } from "@bytecat/player/scratch-esbuild";
import { turbowarpUidReplacement } from "@bytecat/reference";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import type { TraceOptions, TraceResult } from "../trace.js";
import type { OraclePage } from "./page.js";

let pageScript: Promise<string> | null = null;

/** page.ts as one script, built once per process. */
export function oracleScript(): Promise<string> {
  pageScript ??= build({
    entryPoints: [fileURLToPath(new URL("./page.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    target: "es2022",
    platform: "browser",
    logLevel: "error",
    ...scratchBuildOptions({ replace: turbowarpUidReplacement() }),
  }).then((r) => r.outputFiles[0]!.text);
  return pageScript;
}

/** The page: the bundled script and nothing else. */
export async function oracleHtml(): Promise<string> {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Bytecat browser oracle</title>
<style>body { margin: 0; } canvas { display: block; }</style></head>
<body>
<script>${scriptSafe(await oracleScript())}</script>
</body>
</html>
`;
}

/**
 * Chromium flags for WebGL without a GPU: the headless browser draws with SwiftShader, which is the
 * same on every machine.
 */
const CHROMIUM_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

/** One Chromium page with the oracle loaded. Create it with `BrowserOracle.launch`, then `trace` any number of projects. */
export class BrowserOracle {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
    private readonly dir: string,
  ) {}

  static async launch(): Promise<BrowserOracle> {
    const html = await oracleHtml();
    let browser: Browser;
    try {
      browser = await chromium.launch({ args: CHROMIUM_ARGS });
    } catch (e) {
      throw new Error(`Could not launch Chromium. Run \`pnpm exec playwright install chromium\` and try again.\n${e}`);
    }
    const dir = mkdtempSync(join(tmpdir(), "bytecat-oracle-"));
    const file = join(dir, "oracle.html");
    writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    try {
      await page.waitForSelector("body[data-ready=true]", { state: "attached", timeout: 30_000 });
    } catch (e) {
      await browser.close();
      throw new Error(`The oracle page did not start: ${errors.join("; ") || e}`);
    }
    return new BrowserOracle(browser, page, dir);
  }

  /** Traces an .sb3 on Bytecat (actual) against TurboWarp with its renderer (expected). */
  trace(sb3: Uint8Array, options: TraceOptions): Promise<TraceResult> {
    const base64 = Buffer.from(sb3).toString("base64");
    return this.page.evaluate(([data, opts]) => window.bytecatOracle!.trace(data, opts), [base64, options] as const);
  }

  /**
   * Checks Bytecat's scratch-render backend against TurboWarp's geometry after `frames` frames:
   * bounds, fencing, costume sizes, touching and clicks. Returns one line per mismatch.
   */
  compareBackend(sb3: Uint8Array, frames = 1): Promise<string[]> {
    const base64 = Buffer.from(sb3).toString("base64");
    return this.page.evaluate(([data, n]) => window.bytecatOracle!.compareBackend(data, n), [base64, frames] as const);
  }

  /** Runs both engines `frames` frames and lists the grid points (every `step` pixels) where their renderers differ. */
  comparePixels(sb3: Uint8Array, frames: number, step = 5): Promise<string[]> {
    const base64 = Buffer.from(sb3).toString("base64");
    return this.page.evaluate(([data, n, s]) => window.bytecatOracle!.comparePixels(data, n, s), [base64, frames, step] as const);
  }

  /** Whether TurboWarp's ids in the page come from the counter, not Math.random. */
  turbowarpUsesCounterIds(): Promise<boolean> {
    return this.page.evaluate(() => window.bytecatOracle!.turbowarpUsesCounterIds());
  }

  async close(): Promise<void> {
    await this.browser.close();
    rmSync(this.dir, { recursive: true, force: true });
  }
}

declare global {
  interface Window {
    bytecatOracle?: OraclePage;
  }
}

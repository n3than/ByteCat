// Every example in a real browser: the standalone HTML in test mode, with scripted input from
// examples/<name>.input, the log checked against <name>.expected and the canvas against
// <name>.pixels. See "Output and testing" in docs/pseudocode.md for the file formats.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProject, toModule } from "@bytecat/compiler";
import type { Player } from "@bytecat/player";
import { bundleHtml } from "@bytecat/player/bundle";
import { compile } from "@bytecat/pseudo";
import { parseInput } from "@bytecat/trace";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();
const MAX_FRAMES = 10_000;
const TOLERANCE = 8;

interface Probe {
  x: number;
  y: number;
  color: string;
  line: number;
  /** Check right after this frame (1 is the first frame after the green flag); null means after the run. */
  frame: number | null;
}

/** Lines of a test data file without blanks and `//` comments, with their 1-based line numbers. */
function dataLines(path: string): { text: string; line: number }[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l, i) => ({ text: l.trim(), line: i + 1 }))
    .filter((l) => l.text !== "" && !l.text.startsWith("//"));
}


/** Probes from a .pixels file, and whether the page runs in turbo mode (the default in test mode). */
function parsePixels(path: string): { probes: Probe[]; turbo: boolean } {
  const probes: Probe[] = [];
  let turbo = true;
  let frame: number | null = null;
  for (const { text, line } of dataLines(path)) {
    if (text === "turbo off") {
      turbo = false;
      continue;
    }
    const f = /^frame (\d+)$/.exec(text);
    if (f) {
      frame = Number(f[1]);
      continue;
    }
    const m = /^(-?\d+)\s+(-?\d+)\s+(#[0-9a-fA-F]{6})$/.exec(text);
    if (!m) throw new Error(`${path}:${line}: bad pixel probe "${text}" (expected X Y #rrggbb, "turbo off" or "frame N")`);
    probes.push({ x: Number(m[1]), y: Number(m[2]), color: m[3]!.toLowerCase(), line, frame });
  }
  return { probes, turbo };
}

const hex = (rgba: number[]) => "#" + rgba.slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("");

describe("browser", () => {
  let browser: Browser;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "bytecat-browser-"));
    try {
      browser = await chromium.launch();
    } catch (e) {
      throw new Error(`Could not launch Chromium. Run \`pnpm exec playwright install chromium\` and try again.\n${e}`);
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  for (const file of examples) {
    const name = file.replace(/\.sbp$/, "");

    it(name, async () => {
      const inputPath = join(dir, `${name}.input`);
      const commands = existsSync(inputPath) ? parseInput(readFileSync(inputPath, "utf8"), `${name}.input`) : [];
      const { probes, turbo } = parsePixels(join(dir, `${name}.pixels`));
      const { project } = compile(readFileSync(join(dir, file), "utf8"), file);
      const html = join(tmp, `${name}.html`);
      writeFileSync(html, await bundleHtml(project, toModule(compileProject(project.json)), name));

      const page = await browser.newPage();
      try {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${pathToFileURL(html).href}?test${turbo ? "" : "&turbo=off"}`);
        await page.waitForFunction(() => document.body.dataset.ready === "true");

        const result = await page.evaluate(
          ({ commands, probes, maxFrames }) => {
            const p = (window as unknown as { bytecat: Player }).bytecat;
            let frames = 0;
            // Pixels of the probes tied to a frame, read right after that frame.
            const atFrame: ([number, number, number, number] | null)[] = probes.map(() => null);
            const timed = probes.some((q) => q.frame !== null);
            const step = (n: number) => {
              if (!timed) {
                p.step(n);
                frames += n;
                return;
              }
              for (let i = 0; i < n; i++) {
                p.step(1);
                frames++;
                probes.forEach((q, k) => {
                  if (q.frame === frames) atFrame[k] = p.pixel(q.x, q.y);
                });
              }
            };
            p.rt.greenFlag();
            step(1);
            for (const c of commands) {
              if (c.op === "press") p.press(c.key);
              else if (c.op === "release") p.release(c.key);
              else if (c.op === "click") p.click(c.x, c.y);
              else if (c.op === "mouse") Object.assign(p.rt.mouse, { x: c.x, y: c.y });
              // Test mode has no prompt: the runtime takes queued answers, and the asking script
              // resumes in the next frame, as in the trace oracle.
              else if (c.op === "answer") p.rt.answers.push(c.text);
              if (c.op === "step") step(c.n);
              else step(1);
            }
            while (p.rt.running && frames < maxFrames) step(1);
            return {
              running: p.rt.running,
              log: p.rt.log(),
              pixels: probes.map((q, k) => (q.frame === null ? p.pixel(q.x, q.y) : atFrame[k] ?? null)),
            };
          },
          { commands, probes, maxFrames: MAX_FRAMES },
        );

        expect(errors).toEqual([]);
        expect(result.running, `project still running after ${MAX_FRAMES} frames`).toBe(false);
        const expected = readFileSync(join(dir, `${name}.expected`), "utf8")
          .split("\n")
          .filter((l, i, a) => i < a.length - 1 || l !== "");
        expect(result.log).toEqual(expected);

        const failures: string[] = [];
        probes.forEach((q, i) => {
          const actual = result.pixels[i];
          if (!actual) {
            failures.push(`${name}.pixels:${q.line}: the run ended before frame ${q.frame}`);
            return;
          }
          const want = [1, 3, 5].map((k) => parseInt(q.color.slice(k, k + 2), 16));
          const ok = actual[3] === 255 && want.every((w, k) => Math.abs(w - actual[k]!) <= TOLERANCE);
          if (!ok) {
            failures.push(`${name}.pixels:${q.line}: (${q.x}, ${q.y})${q.frame === null ? "" : ` at frame ${q.frame}`} expected ${q.color}, got ${hex(actual)} alpha ${actual[3]}`);
          }
        });
        expect(failures, "pixel probes failed").toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  }
});

// Every example in a real browser: the standalone HTML in test mode, with scripted input from
// examples/<name>.input, the log checked against <name>.expected and the canvas against
// <name>.pixels. See "Output and testing" in docs/pseudocode.md for the file formats.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProject } from "@bytecat/compiler";
import type { Player } from "@bytecat/player";
import { bundleHtml } from "@bytecat/player/bundle";
import { compile } from "@bytecat/pseudo";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();
const MAX_FRAMES = 10_000;
const TOLERANCE = 8;

type Command = { op: "press" | "release"; key: string } | { op: "click"; x: number; y: number } | { op: "step"; n: number };
interface Probe {
  x: number;
  y: number;
  color: string;
  line: number;
}

/** Lines of a test data file without blanks and `//` comments, with their 1-based line numbers. */
function dataLines(path: string): { text: string; line: number }[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l, i) => ({ text: l.trim(), line: i + 1 }))
    .filter((l) => l.text !== "" && !l.text.startsWith("//"));
}

function parseInput(path: string): Command[] {
  return dataLines(path).map(({ text, line }) => {
    const [op = "", ...rest] = text.split(/\s+/);
    const where = `${path}:${line}`;
    if ((op === "press" || op === "release") && rest.length > 0) return { op, key: rest.join(" ") };
    if (op === "click" && rest.length === 2 && rest.every((r) => !Number.isNaN(Number(r)))) {
      return { op, x: Number(rest[0]), y: Number(rest[1]) };
    }
    if (op === "step" && rest.length === 1 && Number.isInteger(Number(rest[0]))) return { op, n: Number(rest[0]) };
    throw new Error(`${where}: bad input command "${text}" (expected press KEY, release KEY, click X Y or step N)`);
  });
}

function parsePixels(path: string): Probe[] {
  return dataLines(path).map(({ text, line }) => {
    const m = /^(-?\d+)\s+(-?\d+)\s+(#[0-9a-fA-F]{6})$/.exec(text);
    if (!m) throw new Error(`${path}:${line}: bad pixel probe "${text}" (expected X Y #rrggbb)`);
    return { x: Number(m[1]), y: Number(m[2]), color: m[3]!.toLowerCase(), line };
  });
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
      const commands = parseInput(join(dir, `${name}.input`));
      const probes = parsePixels(join(dir, `${name}.pixels`));
      const { project } = compile(readFileSync(join(dir, file), "utf8"), file);
      const html = join(tmp, `${name}.html`);
      writeFileSync(html, await bundleHtml(project, compileProject(project.json).code, name));

      const page = await browser.newPage();
      try {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${pathToFileURL(html).href}?test`);
        await page.waitForFunction(() => document.body.dataset.ready === "true");

        const result = await page.evaluate(
          ({ commands, probes, maxFrames }) => {
            const p = (window as unknown as { bytecat: Player }).bytecat;
            let frames = 0;
            const step = (n: number) => {
              p.step(n);
              frames += n;
            };
            p.rt.greenFlag();
            step(1);
            for (const c of commands) {
              if (c.op === "press") p.press(c.key);
              else if (c.op === "release") p.release(c.key);
              else if (c.op === "click") p.click(c.x, c.y);
              if (c.op === "step") step(c.n);
              else step(1);
            }
            while (p.rt.running && frames < maxFrames) step(1);
            return {
              running: p.rt.running,
              log: p.rt.log(),
              pixels: probes.map((q) => p.pixel(q.x, q.y)),
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
          const actual = result.pixels[i]!;
          const want = [1, 3, 5].map((k) => parseInt(q.color.slice(k, k + 2), 16));
          const ok = actual[3] === 255 && want.every((w, k) => Math.abs(w - actual[k]!) <= TOLERANCE);
          if (!ok) {
            failures.push(`${name}.pixels:${q.line}: (${q.x}, ${q.y}) expected ${q.color}, got ${hex(actual)} alpha ${actual[3]}`);
          }
        });
        expect(failures, "pixel probes failed").toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  }
});

// The web app in Chromium, driven through its UI: samples, the editor, opening .sb3 files,
// warnings, the stage and the downloads. It runs on the real clock, so checks poll until the
// expected state shows up.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProject } from "@bytecat/compiler";
import type { Player } from "@bytecat/player";
import { compile } from "@bytecat/pseudo";
import { readSb3, writeSb3, type Project } from "@bytecat/sb3";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWebApp, loadSamples } from "../src/index.js";

const examples = join(import.meta.dirname, "..", "..", "..", "examples");
const expected = (name: string) => readFileSync(join(examples, `${name}.expected`), "utf8").trimEnd().split("\n");
const example = (name: string): Project => compile(readFileSync(join(examples, `${name}.sbp`), "utf8"), `${name}.sbp`).project;

/** Polls `fn` in the page until it returns `want` (compared as JSON) or the timeout passes. */
async function until<T>(page: Page, fn: () => T, want: T, timeout = 10_000): Promise<void> {
  await page.waitForFunction(({ src, want }) => JSON.stringify(eval(`(${src})`)()) === want, { src: fn.toString(), want: JSON.stringify(want) }, { timeout });
}

const outputLines = () => [...document.querySelectorAll("#output li")].map((li) => li.textContent);
/** Page-side view of the app's test hook (functions run in the page, so they spell it out). */
type AppWindow = { bytecatApp: { player: Player | null } };

describe("samples", () => {
  it("every sample compiles with no unsupported blocks", () => {
    const samples = loadSamples();
    expect(samples[0]!.name).toBe("welcome");
    for (const s of samples) {
      const { project } = compile(s.source, `${s.name}.sbp`);
      expect(compileProject(project.json).warnings, s.name).toEqual([]);
    }
  });
});

describe("web app", () => {
  let browser: Browser;
  let tmp: string;
  let url: string;
  let page: Page;
  let errors: string[];

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "bytecat-web-"));
    const html = join(tmp, "index.html");
    writeFileSync(html, await buildWebApp());
    url = pathToFileURL(html).href;
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

  /** A fresh page (and fresh storage) with the app ready. */
  async function open(): Promise<Page> {
    const context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    return page;
  }

  async function close(): Promise<void> {
    expect(errors).toEqual([]);
    await page.context().close();
  }

  async function pickSample(name: string): Promise<void> {
    await page.selectOption("#samples", name);
    await until(page, () => document.getElementById("source-title")!.textContent, `Pseudocode: ${name}`);
  }

  it("starts on the welcome sample, runs it and stops it", async () => {
    await open();
    const options = await page.$$eval("#samples option:not([disabled])", (os) => os.map((o) => o.textContent));
    expect(options).toEqual(loadSamples().map((s) => s.name));
    expect(await page.inputValue("#editor")).toContain("Welcome to Bytecat");
    await page.click("#flag");
    await until(page, outputLines, ["Steer with the left and right arrow keys"]);
    expect(await page.evaluate(() => (window as unknown as AppWindow).bytecatApp.player!.rt.running)).toBe(true);
    await page.click("#stop");
    expect(await page.evaluate(() => (window as unknown as AppWindow).bytecatApp.player!.rt.running)).toBe(false);
    await until(page, () => document.getElementById("status")!.textContent!.startsWith("Stopped"), true);
    await close();
  }, 60_000);

  it("runs a sample and shows its log", async () => {
    await open();
    await pickSample("hello");
    await page.click("#flag");
    await until(page, outputLines, expected("hello"));
    expect(await page.textContent("#output-count")).toBe("4");
    await page.click("[data-tab=js]");
    expect(await page.textContent("#js")).toContain("export default (function (rt)");
    await close();
  }, 60_000);

  it("points at pseudocode errors and runs once they are fixed", async () => {
    await open();
    await page.fill("#editor", 'sprite Cat:\n  when flag:\n    mvoe(10)\n');
    await page.press("#editor", "Control+Enter");
    await until(page, () => !document.getElementById("error")!.hidden, true);
    const message = await page.textContent("#error");
    expect(message).toContain(":3:5: error:");
    expect(message).toContain("move");
    expect(await page.textContent("#gutter .bad")).toBe("3");
    await page.fill("#editor", 'sprite Cat:\n  when flag:\n    log("fixed")\n');
    expect(await page.isHidden("#error")).toBe(true);
    await page.click("#flag");
    await until(page, outputLines, ["fixed"]);
    await close();
  }, 60_000);

  it("replaces the old player on a rerun, so input reaches the new one once", async () => {
    await open();
    const source = 'sprite Cat:\n  when key "space":\n    log("space")\n';
    await page.fill("#editor", source);
    await page.click("#flag");
    await until(page, () => (window as unknown as AppWindow).bytecatApp.player !== null, true);
    await page.evaluate(() => ((window as unknown as { first: unknown }).first = (window as unknown as AppWindow).bytecatApp.player));
    await page.fill("#editor", `# edited\n${source}`);
    await page.click("#flag");
    await until(page, () => (window as unknown as AppWindow & { first: unknown }).bytecatApp.player !== (window as unknown as { first: unknown }).first, true);
    await page.press("#stage", "Space");
    await until(page, outputLines, ["space"]);
    await page.waitForTimeout(200);
    expect(await page.evaluate(outputLines)).toEqual(["space"]);
    // The disposed player no longer listens: the key press started nothing on it.
    expect(await page.evaluate(() => ((window as unknown as { first: Player }).first.rt.threads.length))).toBe(0);
    await close();
  }, 60_000);

  it("keeps one live player when Run is clicked twice in quick succession", async () => {
    // Count the frame-loop intervals the page has running: one per live player.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const live = new Set<unknown>();
      const set = window.setInterval.bind(window);
      const clear = window.clearInterval.bind(window);
      window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        const id = set(fn, ms, ...args);
        if (Math.abs((ms ?? 0) - 1000 / 30) < 1) live.add(id);
        return id;
      }) as typeof window.setInterval;
      window.clearInterval = ((id?: number) => {
        live.delete(id);
        clear(id);
      }) as typeof window.clearInterval;
      (window as unknown as { frameLoops: () => number }).frameLoops = () => live.size;
    });
    page = await context.newPage();
    errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.fill("#editor", 'sprite Cat:\n  when flag:\n    forever:\n      move(1)\n');
    // Both runs start before either has finished loading costumes.
    await page.evaluate(() => {
      const app = (window as unknown as { bytecatApp: { run(): Promise<void> } }).bytecatApp;
      return Promise.all([app.run(), app.run(), app.run()]);
    });
    expect(await page.evaluate(() => (window as unknown as { frameLoops: () => number }).frameLoops())).toBe(1);
    expect(await page.evaluate(() => (window as unknown as AppWindow).bytecatApp.player!.rt.running)).toBe(true);
    await close();
  }, 60_000);

  it("opens a pseudocode file dropped on the page", async () => {
    await open();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(['sprite Cat:\n  when flag:\n    log("dropped")\n'], "dropped.sbp"));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, cancelable: true }));
    });
    await until(page, () => document.getElementById("source-title")!.textContent, "Pseudocode: dropped");
    expect(await page.isHidden("#drop")).toBe(true);
    await page.click("#flag");
    await until(page, outputLines, ["dropped"]);
    await close();
  }, 60_000);

  it("keeps the draft across reloads", async () => {
    await open();
    await page.fill("#editor", 'sprite Cat:\n  when flag:\n    log("kept")\n');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    expect(await page.inputValue("#editor")).toContain('log("kept")');
    await close();
  }, 60_000);

  it("opens an .sb3 file and draws it on the stage", async () => {
    await open();
    await page.setInputFiles("#file", { name: "render.sb3", mimeType: "application/octet-stream", buffer: Buffer.from(writeSb3(example("render"))) });
    await until(page, () => document.getElementById("file-name")!.textContent, "render.sb3");
    expect(await page.isHidden("#editor-wrap")).toBe(true);
    await page.click("#flag");
    await until(page, outputLines, expected("render"));
    await until(page, () => (window as unknown as AppWindow).bytecatApp.player!.rt.running, false);
    const probes = readFileSync(join(examples, "render.pixels"), "utf8")
      .split("\n")
      .map((l) => /^(-?\d+) (-?\d+) #(\w{6})$/.exec(l.trim()))
      .filter((m) => m !== null)
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]), color: m[3]! }));
    const pixels = await page.evaluate((ps) => ps.map((p) => (window as unknown as AppWindow).bytecatApp.player!.pixel(p.x, p.y)), probes);
    probes.forEach((p, i) => {
      const want = [0, 2, 4].map((k) => parseInt(p.color.slice(k, k + 2), 16));
      const got = pixels[i]!;
      expect(want.every((w, k) => Math.abs(w - got[k]!) <= 8) && got[3] === 255, `(${p.x}, ${p.y}) expected #${p.color}, got ${got}`).toBe(true);
    });
    await page.click("#back-to-editor");
    expect(await page.isVisible("#editor-wrap")).toBe(true);
    await close();
  }, 60_000);

  it("leaves the stage empty when going back to the editor while an .sb3 is still loading", async () => {
    await open();
    const bytes = [...writeSb3(example("render"))];
    const player = await page.evaluate(async (bytes) => {
      const app = (window as unknown as { bytecatApp: { player: unknown; openFile(f: File): Promise<void> } }).bytecatApp;
      // The file name is shown right before the player starts loading costumes: go back then.
      new MutationObserver((_, observer) => {
        observer.disconnect();
        document.getElementById("back-to-editor")!.click();
      }).observe(document.getElementById("file-name")!, { childList: true });
      await app.openFile(new File([new Uint8Array(bytes)], "render.sb3"));
      return app.player;
    }, bytes);
    expect(player).toBeNull();
    expect(await page.isVisible("#editor-wrap")).toBe(true);
    await close();
  }, 60_000);

  it("warns about unsupported blocks and costumes it cannot decode", async () => {
    const project = example("hello");
    const stage = project.json.targets[0]!;
    stage.blocks.hat = { opcode: "event_whenflagclicked", next: "pen", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 };
    stage.blocks.pen = { opcode: "pen_clear", next: null, parent: "hat", inputs: {}, fields: {}, shadow: false, topLevel: false };
    const costume = project.json.targets[1]!.costumes[0]!;
    project.assets.set(costume.md5ext, new TextEncoder().encode("not an image"));
    // Files that are not costumes (sounds, here) are never decoded as images.
    project.assets.set("0123456789abcdef0123456789abcdef.wav", new Uint8Array([82, 73, 70, 70]));

    await open();
    await page.setInputFiles("#file", { name: "broken.sb3", mimeType: "application/octet-stream", buffer: Buffer.from(writeSb3(project)) });
    await until(page, () => document.getElementById("warning-count")!.textContent, "2");
    const warnings = await page.$$eval("#warnings li", (lis) => lis.map((li) => li.textContent!));
    expect(warnings[0]).toContain("pen_clear");
    expect(warnings[1]).toContain(costume.md5ext);
    // The rest of the project still runs.
    await page.click("#flag");
    await until(page, outputLines, expected("hello"));
    await close();
  }, 60_000);

  it("rejects a file that is not an .sb3", async () => {
    await open();
    await page.setInputFiles("#file", { name: "nope.sb3", mimeType: "application/octet-stream", buffer: Buffer.from("plain text") });
    await until(page, () => !document.getElementById("error")!.hidden, true);
    expect(await page.textContent("#error")).toContain("nope.sb3 is not a Scratch 3 project");
    await close();
  }, 60_000);

  it("downloads a standalone player, the .sb3 and the JavaScript", async () => {
    await open();
    await pickSample("hello");
    const download = async (kind: string) => {
      await page.click("#download");
      const [file] = await Promise.all([page.waitForEvent("download"), page.click(`[data-download=${kind}]`)]);
      const path = join(tmp, file.suggestedFilename());
      await file.saveAs(path);
      return path;
    };

    const html = await download("html");
    expect(html.endsWith("hello.html")).toBe(true);
    const sb3 = readSb3(readFileSync(await download("sb3")));
    expect(sb3.json.targets.map((t) => t.name)).toEqual(example("hello").json.targets.map((t) => t.name));
    expect(readFileSync(await download("js"), "utf8")).toContain("export default (function (rt)");

    // The downloaded page plays the project on its own.
    const standalone = await page.context().newPage();
    standalone.on("pageerror", (e) => errors.push(e.message));
    await standalone.goto(`${pathToFileURL(html).href}?test`);
    await standalone.waitForFunction(() => document.body.dataset.ready === "true");
    const result = await standalone.evaluate(() => {
      const p = (window as unknown as { bytecat: Player }).bytecat;
      return { ...p.runUntilDone(), log: p.rt.log() };
    });
    expect(result).toMatchObject({ finished: true, log: expected("hello") });
    await close();
  }, 60_000);
});

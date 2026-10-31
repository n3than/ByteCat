import { Runtime, type ProgramFactory } from "@bytecat/runtime";
import { imageSize, type CostumeSizes, type ImageSize, type ProjectJson } from "@bytecat/sb3";
import type { RenderBackend } from "./backend.js";
import { loadCostumes, Renderer, STAGE_HEIGHT, STAGE_WIDTH } from "./renderer.js";

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  project: ProjectJson;
  program: ProgramFactory;
  /** Asset data URLs keyed by md5ext. */
  assets: Record<string, string>;
  /**
   * Test mode: virtual clock, turbo, no frame loop and device pixel ratio 1. Frames only advance
   * when `step()` is called, so screenshots and pixel checks are deterministic.
   */
  test?: boolean;
  /** Turbo mode: a redraw does not end the frame. Defaults to `test`. */
  turbo?: boolean;
  answers?: string[];
  /** The size of each costume image by md5ext (`costumeSizes` in @bytecat/sb3). Default: measured from `assets`. */
  costumeSizes?: CostumeSizes;
  /** Called with the name of each costume image the browser cannot decode (it is skipped). */
  onAssetError?: (name: string) => void;
  /**
   * Makes the renderer backend (backend.ts). Default: the Canvas 2D renderer. Pass
   * `ScratchRenderBackend.create` for TurboWarp's scratch-render (the page must then be bundled
   * with scratchBuildOptions).
   */
  backend?: (canvas: HTMLCanvasElement, rt: Runtime, assets: Record<string, string>) => Promise<RenderBackend>;
}

export interface Player {
  rt: Runtime;
  renderer: RenderBackend;
  greenFlag(): void;
  stop(): void;
  /** Test mode: advance `frames` frames, then render. */
  step(frames?: number): void;
  /** Test mode: green flag, then step until every script stops or `maxFrames` pass. */
  runUntilDone(maxFrames?: number): { finished: boolean; frames: number };
  /** RGBA of the rendered pixel at Scratch stage coordinates (x right, y up, origin at center). */
  pixel(x: number, y: number): [number, number, number, number];
  /** Simulates a key press (Scratch key name, e.g. "space", "a", "left arrow"). */
  press(key: string): void;
  release(key: string): void;
  /** Simulates a click at Scratch stage coordinates. */
  click(x: number, y: number): void;
  /** Stops the frame loop and removes the input listeners, so the canvas can host another player. */
  dispose(): void;
}

const KEY_NAMES: Record<string, string> = {
  " ": "space",
  ArrowLeft: "left arrow",
  ArrowRight: "right arrow",
  ArrowUp: "up arrow",
  ArrowDown: "down arrow",
  Enter: "enter",
};

export function scratchKey(e: KeyboardEvent): string | null {
  if (KEY_NAMES[e.key]) return KEY_NAMES[e.key]!;
  if (e.key.length === 1) return e.key.toLowerCase();
  return null;
}

export async function createPlayer(options: PlayerOptions): Promise<Player> {
  const { canvas, project, program, test = false, turbo = test } = options;
  const rt = new Runtime(project, program, {
    clock: test ? "virtual" : "real",
    turbo,
    costumeSizes: options.costumeSizes ?? (await measureAssets(options.assets)),
    ...(options.answers ? { answers: options.answers } : {}),
  });
  const renderer = options.backend
    ? await options.backend(canvas, rt, options.assets)
    : new Renderer(canvas, rt, await loadCostumes(options.assets, options.onAssetError), test ? 1 : Math.min(2, window.devicePixelRatio || 1));
  // The blocks ask the renderer how far a sprite reaches (fencing, bounce, size limits), as in TurboWarp.
  rt.geometry = renderer;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new AbortController();

  const render = () => {
    renderer.sync();
    renderer.draw();
  };
  const click = (x: number, y: number) => {
    rt.mouse.x = x;
    rt.mouse.y = y;
    renderer.sync();
    rt.click(renderer.pick(x, y) ?? rt.stage);
  };

  const player: Player = {
    rt,
    renderer,
    greenFlag() {
      rt.greenFlag();
      if (!test && !timer) {
        timer = setInterval(() => {
          rt.tick();
          render();
        }, 1000 / 30);
      }
    },
    stop() {
      rt.stopAll();
      render();
    },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) rt.tick();
      render();
    },
    runUntilDone(maxFrames = 10_000) {
      rt.greenFlag();
      let frames = 0;
      while (rt.running && frames < maxFrames) {
        rt.tick();
        frames++;
      }
      render();
      return { finished: !rt.running, frames };
    },
    pixel: (x, y) => renderer.pixel(x, y),
    press: (key) => rt.keyDown(key),
    release: (key) => rt.keyUp(key),
    click,
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
      rt.stopAll();
      rt.onAsk = null;
      listeners.abort();
    },
  };

  if (!test) attachInput(player, listeners.signal);
  render();
  return player;
}

/** The size of each costume image, read from its data or blob URL. */
async function measureAssets(assets: Record<string, string>): Promise<CostumeSizes> {
  const sizes: Record<string, ImageSize> = {};
  await Promise.all(
    Object.entries(assets).map(async ([name, url]) => {
      try {
        const size = imageSize(name, new Uint8Array(await (await fetch(url)).arrayBuffer()));
        if (size) sizes[name] = size;
      } catch {
        // An image that cannot be read has no size: its sprite is neither fenced nor clamped.
      }
    }),
  );
  return sizes;
}

function attachInput(player: Player, signal: AbortSignal): void {
  const { rt, renderer } = player;
  const canvas = renderer.canvas;
  const stagePoint = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * STAGE_WIDTH - STAGE_WIDTH / 2,
      y: STAGE_HEIGHT / 2 - ((e.clientY - r.top) / r.height) * STAGE_HEIGHT,
    };
  };
  canvas.addEventListener("mousemove", (e) => {
    const p = stagePoint(e);
    rt.mouse.x = Math.round(p.x);
    rt.mouse.y = Math.round(p.y);
  }, { signal });
  canvas.addEventListener("mousedown", (e) => {
    rt.mouse.down = true;
    const p = stagePoint(e);
    player.click(Math.round(p.x), Math.round(p.y));
    canvas.focus();
  }, { signal });
  window.addEventListener("mouseup", () => (rt.mouse.down = false), { signal });
  canvas.addEventListener("keydown", (e) => {
    const key = scratchKey(e);
    if (!key) return;
    e.preventDefault();
    if (!e.repeat) rt.keyDown(key);
  }, { signal });
  canvas.addEventListener("keyup", (e) => {
    const key = scratchKey(e);
    if (key) rt.keyUp(key);
  }, { signal });
  rt.onAsk = (question) => askPrompt(canvas, question, signal);
}

/** A minimal text box under the stage for `ask and wait`. */
function askPrompt(canvas: HTMLCanvasElement, question: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    const remove = () => input.remove();
    signal.addEventListener("abort", remove, { once: true });
    input.placeholder = question;
    input.className = "bytecat-ask";
    canvas.after(input);
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      signal.removeEventListener("abort", remove);
      input.remove();
      canvas.focus();
      resolve(input.value);
    });
  });
}

// The browser oracle's page (bundled by oracle.ts, driven through Playwright). It runs the same
// trace as the Node oracle (trace.ts), but TurboWarp gets its real renderer: TurboWarp's
// scratch-render on a WebGL canvas, with scratch-storage for the costumes. So fencing, touching,
// bounce against the costume's bounds, the size limits and clicks on sprites are what TurboWarp
// really does, and no redraw is emulated: the renderer requests them. Bytecat runs next to it in
// the same page with ScratchRenderBackend (Bytecat's renderer interface on the same
// scratch-render), which hit-tests its clicks.
import { mimeType } from "@bytecat/player";
import { BitmapAdapter, RenderWebGL, ScratchRenderBackend, skinsLoaded } from "@bytecat/player/scratch-render";
import { TurboWarpVM, turbowarpModules, turbowarpUsesCounterIds } from "@bytecat/reference/browser";
import { patchTurboWarp, TurboWarpLockstepCore } from "@bytecat/reference/lockstep";
import { mulberry32 } from "@bytecat/reference/virtual";
import type { Target } from "@bytecat/runtime";
import { readSb3 } from "@bytecat/sb3";
import ScratchStorage from "scratch-storage";
import { BytecatLockstep } from "../bytecat.js";
import type { FrameOptions } from "../engine.js";
import type { Snapshot } from "../snapshot.js";
import { traceEngines, type TraceOptions, type TraceResult } from "../trace.js";
import { TurboWarpEngineCore } from "../turbowarp-engine.js";

/** A 480 by 360 stage canvas, at that size in CSS pixels too (scratch-render's picks use client coordinates). */
function stageCanvas(label: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  canvas.style.width = "480px";
  canvas.style.height = "360px";
  canvas.dataset.engine = label;
  document.body.append(canvas);
  return canvas;
}

/** TurboWarp's sprites, as far as the backend comparison reads them. */
interface TwSprite {
  isStage: boolean;
  isOriginal: boolean;
  drawableID: number;
  getName(): string;
  isTouchingSprite(name: string): boolean;
}

/** TurboWarp with its renderer, stepped by the same lockstep driver as in Node. */
class TurboWarpRendered extends TurboWarpEngineCore {
  private constructor(
    tw: TurboWarpLockstepCore,
    private readonly canvas: HTMLCanvasElement,
    readonly renderer: RenderWebGL,
  ) {
    super(tw);
  }

  static async load(sb3: Uint8Array, options: FrameOptions): Promise<TurboWarpRendered> {
    patchTurboWarp(turbowarpModules);
    const { seed = 1, ...rest } = options;
    const vm = new TurboWarpVM();
    vm.attachStorage(new ScratchStorage());
    vm.attachV2BitmapAdapter(new BitmapAdapter());
    const canvas = stageCanvas("turbowarp");
    const renderer = new RenderWebGL(canvas);
    vm.attachRenderer(renderer);
    const tw = new TurboWarpLockstepCore(vm, { ...rest, random: mulberry32(seed) }, { emulateRedraws: false });
    await vm.loadProject(sb3);
    // As in the editor, where the green flag comes after the costumes are on screen.
    await skinsLoaded(renderer);
    tw.start();
    return new TurboWarpRendered(tw, canvas, renderer);
  }

  sprite(name: string): TwSprite | undefined {
    return (this.tw.runtime.targets as TwSprite[]).find((t) => t.isOriginal && !t.isStage && t.getName() === name);
  }

  override dispose(): void {
    super.dispose();
    this.renderer._gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.remove();
  }
}

interface Session {
  bytecat: BytecatLockstep;
  backend: ScratchRenderBackend;
  turbowarp: TurboWarpRendered;
  close(): void;
}

/** Loads the project on both engines: Bytecat with its scratch-render backend, TurboWarp with its renderer. */
async function open(sb3Base64: string, options: FrameOptions): Promise<Session> {
  const sb3 = Uint8Array.from(atob(sb3Base64), (c) => c.charCodeAt(0));
  const project = readSb3(sb3);
  const urls = Object.fromEntries(
    [...project.assets].map(([name, data]) => [name, URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType(name) }))]),
  );
  const bytecat = new BytecatLockstep(project.json, options);
  const canvas = stageCanvas("bytecat");
  const backend = await ScratchRenderBackend.create(canvas, bytecat.rt, urls);
  bytecat.renderer = backend;
  const turbowarp = await TurboWarpRendered.load(sb3, options);
  return {
    bytecat,
    backend,
    turbowarp,
    close() {
      bytecat.dispose();
      turbowarp.dispose();
      backend.dispose();
      canvas.remove();
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    },
  };
}

/** Lists longer than this are cut in the snapshots sent back to Node. */
const LIST_LIMIT = 1000;

/**
 * The snapshots in a result with long lists cut to their first LIST_LIMIT items and a note of how
 * many there were. The comparison already ran on the whole lists; this only keeps the result small
 * for the trip out of the page (a 200,000 item list takes seconds to serialize).
 */
function compact(r: TraceResult): TraceResult {
  const cut = (s: Snapshot): Snapshot => ({
    frame: s.frame,
    fields: Object.fromEntries(
      Object.entries(s.fields).map(([k, v]) => [k, typeof v !== "string" && v.length > LIST_LIMIT ? [...v.slice(0, LIST_LIMIT), `... ${v.length} items`] : v]),
    ),
  });
  return { ...r, actual: cut(r.actual), expected: cut(r.expected), ...(r.agreed ? { agreed: { actual: cut(r.agreed.actual), expected: cut(r.agreed.expected) } } : {}) };
}

/** Traces one project: Bytecat (actual) against TurboWarp with its renderer (expected). */
async function trace(sb3Base64: string, options: TraceOptions): Promise<TraceResult> {
  const s = await open(sb3Base64, options);
  try {
    return compact(await traceEngines(s.bytecat, s.turbowarp, options));
  } finally {
    s.close();
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Checks Bytecat's scratch-render backend against TurboWarp's own geometry after `frames` frames
 * (when both engines show the same state): for every sprite its bounds, fenced position (as `setXY` fences it),
 * costume size and whether it touches each other sprite, and what a click hits on a grid over the
 * stage. Returns one line per mismatch.
 */
async function compareBackend(sb3Base64: string, frames: number): Promise<string[]> {
  const s = await open(sb3Base64, {});
  const { bytecat, backend, turbowarp } = s;
  try {
    for (let i = 0; i < frames; i++) {
      bytecat.step();
      await turbowarp.step();
    }
    backend.sync();
    const renderer = turbowarp.renderer;
    const problems: string[] = [];
    const check = (what: string, actual: unknown, expected: unknown) => {
      if (!same(actual, expected)) problems.push(`${what}: backend ${JSON.stringify(actual)} but turbowarp ${JSON.stringify(expected)}`);
    };
    const sprites = bytecat.rt.targets.filter((t) => !t.isStage);
    const tw = (t: Target) => turbowarp.sprite(t.name)!;
    const box = (b: { left: number; right: number; top: number; bottom: number } | null) => b && [b.left, b.right, b.top, b.bottom].map(round);
    for (const t of sprites) {
      check(`${t.name} bounds`, box(backend.bounds(t)), box(renderer.getBounds(tw(t).drawableID)));
      check(`${t.name} costume size`, backend.costumeSize(t), renderer.getCurrentSkinSize(tw(t).drawableID));
      for (const [x, y] of [[1000, 1000], [-1000, 30], [5, -1000]] as const) {
        check(`${t.name} fenced at ${x}, ${y}`, backend.fence(t, x, y), renderer.getFencedPositionOfDrawable(tw(t).drawableID, [x, y]));
      }
      for (const o of sprites) {
        if (o !== t) check(`${t.name} touching ${o.name}`, backend.touching(t, [o]), tw(t).isTouchingSprite(o.name));
      }
    }
    const nameOf = (id: number) => (turbowarp.tw.runtime.targets as TwSprite[]).find((t) => t.drawableID === id && !t.isStage)?.getName() ?? null;
    for (let y = -170; y <= 170; y += 10) {
      for (let x = -230; x <= 230; x += 10) {
        check(`click at ${x}, ${y}`, backend.pick(x, y)?.name ?? null, nameOf(renderer.pick(x + 240, 180 - y)));
      }
    }
    return problems;
  } finally {
    s.close();
  }
}

/** RGBA of a stage point as scratch-render last drew it (or draws it now). */
function rendererPixel(renderer: RenderWebGL, x: number, y: number): [number, number, number, number] {
  const gl = renderer._gl;
  renderer.draw();
  const out = new Uint8Array(4);
  gl.readPixels(Math.floor(((x + 240) / 480) * gl.drawingBufferWidth), Math.floor(((y + 180) / 360) * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

/**
 * Runs the project `frames` frames on both engines and compares what each renderer shows on a grid
 * every `step` stage pixels, which covers what the pen and stamps leave behind. Both draw with
 * scratch-render, so the pixels must match exactly. Returns one line per mismatch.
 */
async function comparePixels(sb3Base64: string, frames: number, step: number): Promise<string[]> {
  const s = await open(sb3Base64, {});
  const { bytecat, backend, turbowarp } = s;
  try {
    for (let i = 0; i < frames; i++) {
      bytecat.step();
      await turbowarp.step();
    }
    backend.sync();
    const problems: string[] = [];
    for (let y = -175; y <= 175; y += step) {
      for (let x = -235; x <= 235; x += step) {
        const actual = backend.pixel(x, y);
        const expected = rendererPixel(turbowarp.renderer, x, y);
        if (!same(actual, expected)) problems.push(`pixel at ${x}, ${y}: backend ${JSON.stringify(actual)} but turbowarp ${JSON.stringify(expected)}`);
      }
    }
    return problems;
  } finally {
    s.close();
  }
}

export interface OraclePage {
  trace(sb3Base64: string, options: TraceOptions): Promise<TraceResult>;
  compareBackend(sb3Base64: string, frames: number): Promise<string[]>;
  comparePixels(sb3Base64: string, frames: number, step: number): Promise<string[]>;
  turbowarpUsesCounterIds(): boolean;
}

declare global {
  interface Window {
    bytecatOracle?: OraclePage;
  }
}

window.bytecatOracle = { trace, compareBackend, comparePixels, turbowarpUsesCounterIds };
document.body.dataset.ready = "true";

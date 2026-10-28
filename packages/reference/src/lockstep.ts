// Runs TurboWarp (compiler on) one frame at a time on a virtual clock, for the trace oracle
// (docs/testing.md). The VM's own frame loop never starts: `step()` calls the runtime's `_step()`
// directly, the way its interval would, with every source of machine dependence replaced:
//
// - time: `currentMSecs` (which `wait`, `glide`, `timer` and the compiled timers read) is
//   frame * 1000 / fps, the same formula as Bytecat's virtual clock, and TurboWarp's default Timer
//   (used by `glide`) reads the same clock;
// - the frame budget: the sequencer's work timer reports that time is up after exactly `passes`
//   passes over the threads, instead of after 75% of the frame on the wall clock;
// - Math.random, Date.now and setTimeout: see virtual.ts; ids: see tw-ids.ts;
// - redraw requests: headless TurboWarp has no renderer, and only its renderer code paths request a
//   redraw, so without help no frame would end on a redraw. `emulateRedraws` makes the targets of a
//   lockstep VM request one exactly where they would with a renderer attached.
import "./tw-ids.js";
import { createRequire } from "node:module";
import TurboWarpVM from "turbowarp-vm";
import { silenced } from "./quiet.js";
import { flushPromises, VirtualTimers, withVirtualGlobals } from "./virtual.js";

const require = createRequire(import.meta.url);

export interface LockstepOptions {
  /** Frames per second. Default 30. */
  fps?: number;
  /** Turbo mode: a redraw does not end the frame. Default false. */
  turbo?: boolean;
  /** The most passes over the threads in one frame (the virtual work budget). Default 50. */
  passes?: number;
  /** Replaces Math.random while a frame runs. Default: Math.random itself. */
  random?: () => number;
  /** Date.now() at frame 0, in milliseconds since the epoch. Default 1 January 2026, 00:00 UTC. */
  date?: number;
}

export const DEFAULT_DATE = Date.UTC(2026, 0, 1);

/** A TurboWarp key name ("space", "left arrow", "a") as the DOM `key` its keyboard expects. */
function domKey(key: string): string {
  const k = key.toLowerCase();
  const named: Record<string, string> = {
    space: " ",
    "left arrow": "ArrowLeft",
    "up arrow": "ArrowUp",
    "right arrow": "ArrowRight",
    "down arrow": "ArrowDown",
    enter: "Enter",
  };
  return named[k] ?? key;
}

// ---- redraw requests as with a renderer ----

interface TwRuntime {
  [key: string]: any;
}
interface TwTarget {
  [key: string]: any;
}

const EMULATE = "bytecatEmulateRedraws";

/**
 * For each RenderedTarget method that requests a redraw in its renderer branch: whether it would get
 * that far (the early returns before the branch). After the call, a visible target requests the
 * redraw, as `if (this.renderer) { ... if (this.visible) runtime.requestRedraw(); }` does.
 * Layer changes (`goToFront` and friends) never request one in TurboWarp.
 */
const redrawingMethods: Record<string, (t: TwTarget, args: any[]) => boolean> = {
  setXY: (t, [, , force]) => !t.isStage && !(t.dragging && !force),
  setDirection: (t, [direction]) => !t.isStage && isFinite(direction),
  setSize: (t) => !t.isStage,
  setVisible: (t) => !t.isStage,
  setEffect: (t, [name]) => Object.prototype.hasOwnProperty.call(t.effects, name),
  clearEffects: () => true,
  setCostume: () => true,
  setRotationStyle: () => true,
  dispose: () => true,
};

let patched = false;

/** The virtual clock of the lockstep VM whose frame is running, for TurboWarp's default Timer. */
let activeClock: { now(): number } | null = null;

/**
 * Patches TurboWarp once per process: its Timer (see `activeClock`), and its RenderedTarget and
 * looks blocks so that a runtime with `bytecatEmulateRedraws` set requests redraws the way it
 * would with a renderer. Other VMs in the process (`runProject`) are unaffected.
 */
function patchTurboWarp(): void {
  if (patched) return;
  patched = true;
  // TurboWarp's default Timer (glide, and the stack timers of interpreted blocks) reads Date.now. A
  // Timer made during a lockstep frame reads that VM's virtual clock instead, like currentMSecs, so
  // elapsed times are exact rather than rounded against a date 56 years after the epoch.
  const Timer = require("turbowarp-vm/src/util/timer");
  const nowObj = Object.getOwnPropertyDescriptor(Timer, "nowObj")!.get!;
  Object.defineProperty(Timer, "nowObj", { configurable: true, get: () => activeClock ?? nowObj.call(Timer) });

  const RenderedTarget = require("turbowarp-vm/src/sprites/rendered-target");
  for (const [name, reaches] of Object.entries(redrawingMethods)) {
    const original = RenderedTarget.prototype[name];
    RenderedTarget.prototype[name] = function (this: TwTarget, ...args: any[]) {
      const emulate = !this.renderer && this.runtime?.[EMULATE] === true && reaches(this, args);
      const result = original.apply(this, args);
      if (emulate && this.visible) this.runtime.requestRedraw();
      return result;
    };
  }

  // Bubbles: with a renderer, showing a bubble on a visible target positions it (a redraw), and
  // removing one that is drawn destroys its drawable (a redraw). `bytecatBubbleShown` stands in
  // for the drawable.
  const Looks = require("turbowarp-vm/src/blocks/scratch3_looks");
  const render = Looks.prototype._renderBubble;
  const exit = Looks.prototype._onTargetWillExit;
  Looks.prototype._onTargetWillExit = function (this: TwRuntime, target: TwTarget) {
    if (!this.runtime.renderer && this.runtime[EMULATE] === true) {
      const state = this._getBubbleState(target);
      if (state.bytecatBubbleShown) {
        state.bytecatBubbleShown = false;
        this.runtime.requestRedraw();
      }
    }
    return exit.call(this, target);
  };
  Looks.prototype._renderBubble = function (this: TwRuntime, target: TwTarget) {
    if (!this.runtime.renderer && this.runtime[EMULATE] === true) {
      const state = this._getBubbleState(target);
      if (!target.visible || state.text === "") {
        this._onTargetWillExit(target);
      } else {
        state.bytecatBubbleShown = true;
        this.runtime.requestRedraw();
      }
      return;
    }
    return render.call(this, target);
  };
}

// ---- the driver ----

/** TurboWarp stepped one frame at a time. Create it with `TurboWarpLockstep.load`. */
export class TurboWarpLockstep {
  /** Frames stepped since the green flag. */
  frame = 0;
  /** Scripts TurboWarp could not compile, as "Sprite: message". */
  readonly compileErrors: string[] = [];
  /** Questions asked and not answered yet, oldest first. */
  readonly questions: string[] = [];
  readonly fps: number;
  readonly runtime: TwRuntime;
  private readonly timers: VirtualTimers;
  private readonly clock: { now(): number };
  private readonly env: Parameters<typeof withVirtualGlobals>[0];

  private constructor(readonly vm: TurboWarpVM, options: LockstepOptions) {
    const { fps = 30, turbo = false, passes = 50, random = Math.random, date = DEFAULT_DATE } = options;
    if (!(Number.isInteger(passes) && passes >= 1)) throw new Error(`passes must be a positive integer, got ${passes}`);
    this.fps = fps;
    this.runtime = vm.runtime as unknown as TwRuntime;
    const rt = this.runtime;
    const now = () => (this.frame * 1000) / fps;
    this.clock = { now };
    this.timers = new VirtualTimers(now);
    this.env = { random, date: () => date + now(), timers: this.timers };

    vm.setCompilerOptions({ enabled: true, warpTimer: false });
    vm.setTurboMode(turbo);
    rt.currentStepTime = 1000 / fps;
    rt[EMULATE] = true;
    rt.updateCurrentMSecs = () => {
      rt.currentMSecs = now();
    };
    rt.updateCurrentMSecs();
    // The work timer: reading it once per pass, the sequencer stops after `passes` passes.
    let reads = 0;
    rt.sequencer.timer = {
      start: () => (reads = 0),
      timeElapsed: () => (reads++ < passes ? 0 : Infinity),
      time: now,
    };
    rt.on("COMPILE_ERROR", (target: { getName(): string }, error: unknown) => {
      this.compileErrors.push(`${target.getName()}: ${error instanceof Error ? error.message : String(error)}`);
    });
    rt.on("QUESTION", (question: string | null) => {
      // null closes the prompt (the asker stopped); "" means the asker shows the question in a bubble.
      if (question === null) this.questions.length = 0;
      else this.questions.push(question);
    });
  }

  /** Loads the project and clicks the green flag. Nothing runs until the first `step()`. */
  static async load(sb3: Uint8Array, options: LockstepOptions = {}): Promise<TurboWarpLockstep> {
    patchTurboWarp();
    const vm = await silenced(async () => new TurboWarpVM());
    const lockstep = new TurboWarpLockstep(vm, options);
    await silenced(() => vm.loadProject(sb3));
    lockstep.inFrame(() => vm.greenFlag());
    return lockstep;
  }

  /** Runs `fn` in the virtual environment (random, date, timers, TurboWarp's Timer). */
  private inFrame<T>(fn: () => T): T {
    const previous = activeClock;
    activeClock = this.clock;
    try {
      return withVirtualGlobals(this.env, fn);
    } finally {
      activeClock = previous;
    }
  }

  /** Runs one frame: fires due timers, lets answered questions resume, then steps every thread. */
  async step(): Promise<void> {
    this.runtime.updateCurrentMSecs();
    if (this.inFrame(() => this.timers.fireDue()) > 0) await flushPromises();
    this.inFrame(() => this.runtime._step());
    this.frame++;
  }

  /** True while any thread is running or waiting. */
  get running(): boolean {
    return this.runtime.threads.length > 0;
  }

  keyDown(key: string): void {
    this.inFrame(() => this.vm.postIOData("keyboard", { key: domKey(key), isDown: true }));
  }

  keyUp(key: string): void {
    this.inFrame(() => this.vm.postIOData("keyboard", { key: domKey(key), isDown: false }));
  }

  /** Moves the mouse to stage coordinates (origin at the center, y up). */
  mouseMove(x: number, y: number): void {
    this.inFrame(() => this.vm.postIOData("mouse", this.mouseData(x, y)));
  }

  /** Presses and releases the mouse at stage coordinates. Without a renderer it hits the stage. */
  click(x: number, y: number): void {
    this.inFrame(() => {
      this.vm.postIOData("mouse", { ...this.mouseData(x, y), isDown: true });
      this.vm.postIOData("mouse", { ...this.mouseData(x, y), isDown: false });
    });
  }

  /** Answers the oldest open question; the asking thread resumes in the next frame. */
  async answer(text: string): Promise<void> {
    this.questions.shift();
    this.inFrame(() => this.runtime.emit("ANSWER", text));
    await flushPromises();
  }

  dispose(): void {
    this.vm.stopAll();
    this.vm.quit();
  }

  private mouseData(x: number, y: number) {
    return { x: x + 240, y: 180 - y, canvasWidth: 480, canvasHeight: 360 };
  }
}

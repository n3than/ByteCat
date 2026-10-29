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
//   lockstep VM request one exactly where they would with a renderer attached. A VM with a real
//   renderer (the browser oracle) needs none of this.
//
// This file has no Node imports and does not load TurboWarp itself: the caller passes the VM and
// TurboWarp's modules in. lockstep.ts loads them in Node; the browser oracle bundles them
// (packages/trace/src/browser).
import type TurboWarpVM from "turbowarp-vm";
import { DEFAULT_DATE, flushPromises, VirtualTimers, withTimerLabel, withVirtualGlobals } from "./virtual.js";

/** The label of the timers TurboWarp's `say for secs` and `think for secs` set (`running`). */
const BUBBLE_TIMER = "bubble";

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
  // A new clone's drawable (makeClone).
  updateAllDrawableProperties: () => true,
};

let patched = false;

/** The virtual clock of the lockstep VM whose frame is running, for TurboWarp's default Timer. */
let activeClock: { now(): number } | null = null;

/** The TurboWarp modules the driver patches: `src/util/timer`, `src/sprites/rendered-target` and `src/blocks/scratch3_looks`. */
export interface TurboWarpModules {
  Timer: any;
  RenderedTarget: any;
  Looks: any;
}

/**
 * Patches TurboWarp once per process (or page): its Timer (see `activeClock`), and its
 * RenderedTarget and looks blocks so that a runtime with `bytecatEmulateRedraws` set requests
 * redraws the way it would with a renderer. Other VMs in the process (`runProject`) are unaffected.
 */
export function patchTurboWarp({ Timer, RenderedTarget, Looks }: TurboWarpModules): void {
  if (patched) return;
  patched = true;
  // TurboWarp's default Timer (glide, and the stack timers of interpreted blocks) reads Date.now. A
  // Timer made during a lockstep frame reads that VM's virtual clock instead, like currentMSecs, so
  // elapsed times are exact rather than rounded against a date 56 years after the epoch.
  const nowObj = Object.getOwnPropertyDescriptor(Timer, "nowObj")!.get!;
  Object.defineProperty(Timer, "nowObj", { configurable: true, get: () => activeClock ?? nowObj.call(Timer) });

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
  // The timer of a `say for secs` or `think for secs` clears the bubble even after its script
  // stopped, so the driver counts it as running. TurboWarp may set other timers; only these count.
  for (const name of ["sayforsecs", "thinkforsecs"]) {
    const original = Looks.prototype[name];
    Looks.prototype[name] = function (this: unknown, ...args: unknown[]) {
      return withTimerLabel(BUBBLE_TIMER, () => original.apply(this, args));
    };
  }

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

/**
 * TurboWarp stepped one frame at a time. In Node, create it with `TurboWarpLockstep.load`
 * (lockstep.ts). Elsewhere call `patchTurboWarp`, construct it on a fresh VM, load the project and
 * call `start()`.
 */
export class TurboWarpLockstepCore {
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

  /**
   * `emulateRedraws`: request redraws where a renderer would (default true). Pass false for a VM
   * with a renderer attached, which requests them itself.
   */
  constructor(readonly vm: TurboWarpVM, options: LockstepOptions, { emulateRedraws = true } = {}) {
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
    rt[EMULATE] = emulateRedraws;
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

  /** Clicks the green flag, once the project is loaded. Nothing runs until the first `step()`. */
  start(): void {
    this.inFrame(() => this.vm.greenFlag());
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

  /**
   * True while any thread is running or waiting, or a `say for secs` timer has not fired: it still
   * clears its bubble after its script stopped.
   */
  get running(): boolean {
    return this.runtime.threads.length > 0 || this.timers.pendingWith(BUBBLE_TIMER) > 0;
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

  /**
   * Presses and releases the mouse at stage coordinates. With a renderer TurboWarp picks the sprite
   * under the mouse; without one it hits the stage.
   */
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

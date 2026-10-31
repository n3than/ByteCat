import type { ProjectJson } from "@bytecat/sb3";
import { Target } from "./target.js";
import { Thread, type Hat, type HatKind, type ProgramFactory } from "./thread.js";
import { tick } from "./scheduler.js";

export interface RuntimeOptions {
  /** Skip the redraw that normally ends a frame after visible changes. Default false. */
  turbo?: boolean;
  /** Frames per second of the scheduler. Default 30. */
  fps?: number;
  /** "real" uses wall-clock time; "virtual" advances time by exactly one frame per tick. */
  clock?: "real" | "virtual";
  /** Answers for `ask` blocks when no UI is attached. */
  answers?: string[];
  /** The clock the scheduler reads, in milliseconds, to end frames on time. Tests inject one. */
  schedulerClock?: () => number;
}

export interface SayEvent {
  target: string;
  kind: "say" | "think";
  text: string;
}

/** A callback from `Runtime.later`. */
export interface Timeout {
  start: number;
  ms: number;
  fn: () => void;
}

/** The most clones that can exist at once, across all sprites: TurboWarp's default `maxClones`. */
export const MAX_CLONES = 300;

/** The hats one event starts, each with the target it runs for, in start order (`startHats`). */
interface StartList {
  targets: Target[];
  hats: Hat[];
}

/**
 * The state of a running project. Generated code reads and writes its public fields (`stage`,
 * `spin`, `answer`, `mouse`, ...) and passes it to the plain functions in `lib/`, where the
 * blocks' behaviour lives. The runtime itself only starts scripts and runs frames.
 */
export class Runtime {
  /**
   * The stage and the sprites in project order (`targets[i]` is `project.targets[i]`), then the
   * clones in the order they were made, like TurboWarp's `runtime.targets`.
   */
  readonly targets: Target[];
  readonly stage: Target;
  /** How many clones exist. `create clone` makes none while there are MAX_CLONES. */
  cloneCount = 0;
  readonly hats: Hat[];
  threads: Thread[] = [];
  /**
   * True while `threads` may hold a thread that is done: one ended or was stopped since `tick` last
   * filtered the list at the end of a pass. `broadcast and wait` only searches the list then.
   */
  doneListed = false;
  readonly says: SayEvent[] = [];
  /** Set by `requestRedraw()` when a block changes what is on screen; ends the frame early unless in turbo mode. */
  redraw = false;
  /**
   * How many more loop iterations the running thread may complete without yielding. Generated
   * loops do `if (th.warp === 0 && --rt.spin < 0) yield;`, so while this is 0 or less every
   * iteration yields. `tick` sets it before each step: `spinLimit` for a thread running alone,
   * 0 when there are others. `start` and `requestRedraw` (outside turbo mode) set it to 0.
   */
  spin = 0;
  answer = "";
  /**
   * The hidden counter blocks' value (`control_incr_counter`, `control_clear_counter`,
   * `control_get_counter`): one per runtime, shared by every target. Like TurboWarp's
   * `ext_scratch3_control._counter`, the green flag and stop do not reset it.
   */
  counter = 0;
  mouse = { x: 0, y: 0, down: false };
  readonly keys = new Set<string>();
  onAsk: ((question: string) => Promise<string>) | null = null;

  /** @internal Read by the scheduler (`scheduler.ts`). */
  readonly options: Required<Omit<RuntimeOptions, "answers" | "schedulerClock">>;
  /** @internal Queued answers for `ask` (`lib/sensing.ts`). */
  readonly answers: string[];
  /** @internal Read by the scheduler (`scheduler.ts`). */
  readonly schedulerClock: () => number;
  /** @internal Counted by the scheduler (`scheduler.ts`). */
  frame = 0;
  private readonly startTime = performance.now();
  private frameTime = 0;
  /** Callbacks waiting for `startFrame` (`later`), in the order they were set. */
  private timeouts: Timeout[] = [];
  /**
   * @internal The last `say for secs` timer set, until any of them runs (`lib/looks.ts`): the one
   * TurboWarp's stop all clears (`_bubbleTimeout` in its looks blocks).
   */
  bubbleTimeout: Timeout | null = null;
  /** @internal Read and reset by the timer helpers (`lib/sensing.ts`). */
  timerStart = 0;
  /** How many targets project.json has; the clones come after them in `targets`. */
  private readonly originals: number;
  /**
   * Each sprite's (and the stage's) hats by event and argument ("" for none), in the order its
   * scripts appear, by target index. Its clones share them.
   */
  private readonly hatIndex: Map<HatKind, Map<string, Hat[]>>[];
  /**
   * The start list of each event that has hats, built on first use and dropped when a layer
   * changes or a clone comes or goes (`layersChanged`). Events no hat listens to are never
   * stored, so broadcasting made-up names does not fill it.
   */
  private startLists = new Map<HatKind, Map<string, StartList>>();
  /**
   * The event `startHats` started last and its start list, in front of `startLists`: a project
   * that broadcasts the same message over and over finds it with two comparisons.
   */
  private lastKind: HatKind | null = null;
  private lastArg = "";
  private lastList: StartList | undefined;
  /** Every target from the top layer down (the stage last), or null after a change. */
  private topDown: Target[] | null = null;

  constructor(readonly project: ProjectJson, program: ProgramFactory, options: RuntimeOptions = {}) {
    this.options = { turbo: false, fps: 30, clock: "real", ...options };
    this.answers = [...(options.answers ?? [])];
    this.schedulerClock = options.schedulerClock ?? (() => performance.now());
    this.targets = Target.all(project);
    this.stage = this.targets[0]!;
    this.originals = this.targets.length;
    this.hats = program(this);
    this.hatIndex = this.targets.map(() => new Map());
    for (const hat of this.hats) {
      const byArg = this.hatIndex[hat.target]!;
      let byKind = byArg.get(hat.kind);
      if (!byKind) byArg.set(hat.kind, (byKind = new Map()));
      const arg = hat.arg ?? "";
      const list = byKind.get(arg);
      if (list) list.push(hat);
      else byKind.set(arg, [hat]);
    }
  }

  /**
   * Milliseconds since the project started, on the configured clock, as of the start of the
   * current frame: like TurboWarp's `currentMSecs`, which its waits and timer read, it stands still
   * while a frame runs. `tick` and the green flag move it on (`startFrame`).
   */
  now(): number {
    if (this.options.clock === "virtual") return (this.frame * 1000) / this.options.fps;
    return this.frameTime;
  }

  /** Like `now()`, but read from the real clock at the call, as TurboWarp times a glide. */
  liveNow(): number {
    if (this.options.clock === "virtual") return (this.frame * 1000) / this.options.fps;
    return performance.now() - this.startTime;
  }

  /**
   * @internal Sets the time `now()` reports for the frame that starts, then runs the callbacks
   * from `later` that are due. `tick` calls it before it clears `redraw`, so a redraw that a
   * callback requests is dropped, as TurboWarp's `_step` drops one requested between frames.
   */
  startFrame(): void {
    this.frameTime = performance.now() - this.startTime;
    if (this.timeouts.length > 0) this.runTimeouts();
  }

  /**
   * Runs `fn` between frames once `ms` milliseconds of `now()` have passed, the way TurboWarp's
   * `say for secs` uses `setTimeout`. Like a timer in Node and in browsers, a delay below 1 ms or
   * above 2^31 - 1 ms waits 1 ms. A pending callback counts as `running`.
   */
  later(ms: number, fn: () => void): Timeout {
    const timeout = { start: this.now(), ms: ms >= 1 && ms <= 2147483647 ? ms : 1, fn };
    this.timeouts.push(timeout);
    return timeout;
  }

  /** Drops a callback from `later` that has not run, like `clearTimeout`. */
  cancel(timeout: Timeout): void {
    this.timeouts = this.timeouts.filter((x) => x !== timeout);
  }

  private runTimeouts(): void {
    const now = this.now();
    const due = this.timeouts.filter((x) => now - x.start >= x.ms);
    if (due.length === 0) return;
    this.timeouts = this.timeouts.filter((x) => now - x.start < x.ms);
    for (const x of due) x.fn();
  }

  // ---- starting scripts ----

  /**
   * Starts `hat` for `target`, the sprite it belongs to or one of its clones. Like TurboWarp's
   * `startHats`, it looks through the thread list for the hat's thread on that target, once per
   * start. Remembering each target's threads instead (a field on the target) cost pingpong 4% more
   * instructions than the search: every start stored a new thread into an old object and kept the
   * finished one alive.
   */
  private start(hat: Hat, target: Target): Thread | undefined {
    const threads = this.threads;
    // A hat that does not restart its script (`when key pressed`) is not started again while the
    // script runs. Once it has finished, the new run goes at the end of the list like any new
    // thread, even if the finished one is still listed, as in TurboWarp.
    if (hat.restart === false) {
      for (let i = 0; i < threads.length; i++) {
        const old = threads[i]!;
        if (old.hat === hat && old.target === target && !old.done) return undefined;
      }
      return this.push(new Thread(hat, target));
    }
    const th = new Thread(hat, target);
    // Re-triggering a hat restarts its script in the same place in the thread list, like
    // TurboWarp, so the new run waits for the next pass if that place is behind. That includes a
    // run that finished earlier in this pass: TurboWarp only forgets a thread when the pass ends,
    // and so does `tick`. There is at most one thread per restarting hat and target in the list.
    for (let i = 0; i < threads.length; i++) {
      const old = threads[i]!;
      if (old.hat === hat && old.target === target) {
        old.done = true;
        threads[i] = th;
        this.spin = 0;
        return th;
      }
    }
    return this.push(th);
  }

  private push(th: Thread): Thread {
    this.threads.push(th);
    // A loop that is spinning must yield at the end of its iteration so the new thread runs in
    // the same pass, as in Scratch.
    this.spin = 0;
    return th;
  }

  /**
   * @internal Starts the hats for `kind` and `arg` (`Hat.arg`, "" for hats without one) in
   * TurboWarp's order: targets from the top layer down with the stage last, clones included, and
   * within a target in the order its scripts appear. Called by `broadcast` (`lib/event.ts`).
   */
  startHats(kind: HatKind, arg = ""): Thread[] {
    const started: Thread[] = [];
    if (kind !== this.lastKind || arg !== this.lastArg) {
      this.lastKind = kind;
      this.lastArg = arg;
      this.lastList = this.startLists.get(kind)?.get(arg) ?? this.startList(kind, arg);
    }
    const list = this.lastList;
    if (!list) return started;
    const { targets, hats } = list;
    for (let i = 0; i < hats.length; i++) {
      const th = this.start(hats[i]!, targets[i]!);
      if (th) started.push(th);
    }
    return started;
  }

  /** Builds and stores the start list for an event, or returns undefined when no hat has it. */
  private startList(kind: HatKind, arg: string): StartList | undefined {
    if (!this.hatIndex.some((byKind) => byKind.get(kind)?.has(arg))) return undefined;
    const list: StartList = { targets: [], hats: [] };
    for (const t of this.topDown ?? this.layerOrder()) {
      for (const hat of this.hatIndex[t.index]!.get(kind)?.get(arg) ?? []) {
        list.targets.push(t);
        list.hats.push(hat);
      }
    }
    let byArg = this.startLists.get(kind);
    if (!byArg) this.startLists.set(kind, (byArg = new Map()));
    byArg.set(arg, list);
    return list;
  }

  /** Every target from the top layer down; layers are distinct (see `Target.all`). */
  private layerOrder(): Target[] {
    this.topDown = [...this.targets].sort((a, b) => b.layer - a.layer);
    return this.topDown;
  }

  /** Starts `target`'s own hats for `kind` (a clone's `clone` hats, a sprite's `click` hats). */
  private startOwn(target: Target, kind: HatKind): void {
    for (const hat of this.hatIndex[target.index]!.get(kind)?.get("") ?? []) this.start(hat, target);
  }

  /**
   * @internal Called after a layer changes (`goToFront` in `lib/looks.ts`) and when a clone is
   * added or removed.
   */
  layersChanged(): void {
    this.topDown = null;
    this.lastKind = null;
    if (this.startLists.size > 0) this.startLists = new Map();
  }

  // ---- clones ----

  /**
   * @internal Adds a clone that `createClone` (`lib/control.ts`) made of `parent`: just behind
   * it, as TurboWarp's `goBehindOther` places it, and starts its "when I start as a clone" hats.
   */
  addClone(clone: Target, parent: Target): void {
    this.cloneCount++;
    for (const t of this.targets) if (t.layer >= parent.layer) t.layer++;
    clone.layer = parent.layer - 1;
    this.targets.push(clone);
    this.layersChanged();
    // TurboWarp's renderer draws a visible clone at once (`updateAllDrawableProperties`).
    if (clone.visible) this.requestRedraw();
    this.startOwn(clone, "clone");
  }

  /** @internal Removes a clone and stops its scripts (`deleteClone` in `lib/control.ts`). */
  removeClone(clone: Target): void {
    const i = this.targets.indexOf(clone);
    // A clone removed already (by stop all, or by another thread of its own) is no longer
    // listed: indexOf gives -1, below `originals`, so nothing happens, as it would for an original.
    if (i < this.originals) return;
    this.targets.splice(i, 1);
    this.cloneCount--;
    for (const th of this.threads) if (th.target === clone) th.done = true;
    this.doneListed = true;
    this.spin = 0;
    // TurboWarp's renderer redraws when a visible clone, or a bubble it shows, goes away.
    if (clone.visible || clone.bubbleDrawn) this.requestRedraw();
    this.layersChanged();
  }

  greenFlag(): void {
    this.stopAll();
    this.startFrame();
    this.timerStart = this.now();
    this.startHats("flag");
  }

  /** A key press starts the hats for that key, then the "any" key hats, like TurboWarp. */
  keyDown(key: string): void {
    this.keys.add(key);
    this.startHats("key", key);
    this.startHats("key", "any");
  }

  keyUp(key: string): void {
    this.keys.delete(key);
  }

  click(target: Target): void {
    this.startOwn(target, "click");
  }

  stopAll(): void {
    for (const th of this.threads) th.done = true;
    this.threads = [];
    this.spin = 0;
    // Like TurboWarp, which clears only the last `say for secs` timeout. The others still run (and
    // count as running), but they find every bubble gone and their threads stopped.
    if (this.bubbleTimeout) this.cancel(this.bubbleTimeout);
    this.bubbleTimeout = null;
    for (const t of this.targets) {
      t.bubble = null;
      t.bubbleDrawn = false;
    }
    // Every clone goes, as in TurboWarp, whose renderer redraws if one was visible.
    if (this.targets.length > this.originals) {
      if (this.targets.some((t, i) => i >= this.originals && t.visible)) this.requestRedraw();
      this.targets.length = this.originals;
      this.cloneCount = 0;
      this.layersChanged();
    }
  }

  // ---- scheduler ----

  /**
   * Called by blocks that change what is on screen. Ends the frame early unless in turbo mode, and
   * then also ends any spin, so a loop that draws still yields at the end of every iteration and
   * draws once per frame.
   */
  requestRedraw(): void {
    this.redraw = true;
    if (!this.options.turbo) this.spin = 0;
  }
  /** Runs one frame; see `tick` in `scheduler.ts`. */
  tick(): void {
    tick(this);
  }

  /**
   * True while a script runs or waits, or a `later` callback has not run yet: a `say for secs`
   * timer still clears its bubble after its script stopped, as in TurboWarp.
   */
  get running(): boolean {
    return this.timeouts.length > 0 || this.scriptsRunning;
  }

  /**
   * True while a script runs or waits, whatever timers are pending: what TurboWarp's green flag
   * indicator shows, as it follows the thread list.
   */
  get scriptsRunning(): boolean {
    return this.threads.some((th) => !th.done);
  }

  /** Headless helper: green flag, then tick until every script stops or the time limit passes. */
  runUntilDone(timeoutMs = 10_000): { finished: boolean; elapsedMs: number; frames: number } {
    const start = performance.now();
    this.greenFlag();
    const first = this.frame;
    while (this.running && performance.now() - start < timeoutMs) this.tick();
    return { finished: !this.running, elapsedMs: performance.now() - start, frames: this.frame - first };
  }

  /** Reads the `log` list on the stage, the standard test output. */
  log(): string[] {
    const entry = Object.entries(this.project.targets[0].lists).find(([, [name]]) => name === "log");
    return entry ? (this.stage.l[entry[0]] ?? []).map(String) : [];
  }
}

import type { ProjectJson } from "@bytecat/sb3";
import * as ops from "./ops.js";
import { Target } from "./target.js";
import type { Value } from "./ops.js";
import { STOP_ALL, Thread, WAIT, type Hat, type HatKind, type ProgramFactory } from "./thread.js";
import { tick } from "./scheduler.js";
import { wait } from "./lib/control.js";
import { costumeName, goToFront, nextCostume, say, sayFor, setSize, setVisible, switchCostume } from "./lib/looks.js";
import { bounce, coord, glide, move, setDirection, setXY } from "./lib/motion.js";
import { ask, daysSince2000, keyPressed, resetTimer, timer } from "./lib/sensing.js";

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

export class Runtime {
  readonly ops = ops;
  readonly WAIT = WAIT;
  readonly STOP_ALL = STOP_ALL;
  readonly targets: Target[];
  readonly stage: Target;
  readonly hats: Hat[];
  threads: Thread[] = [];
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
  /** @internal Read and reset by the timer helpers (`lib/sensing.ts`). */
  timerStart = 0;
  /** Each target's hats, in the order its scripts appear. */
  private readonly hatsByTarget: Hat[][];
  /** @internal Every hat in start order (see `startHats`), or null after a layer change (`lib/looks.ts`). */
  ordered: Hat[] | null = null;

  constructor(readonly project: ProjectJson, program: ProgramFactory, options: RuntimeOptions = {}) {
    this.options = { turbo: false, fps: 30, clock: "real", ...options };
    this.answers = [...(options.answers ?? [])];
    this.schedulerClock = options.schedulerClock ?? (() => performance.now());
    this.targets = Target.all(project);
    this.stage = this.targets[0]!;
    this.hats = program(this);
    this.hatsByTarget = this.targets.map(() => []);
    for (const hat of this.hats) this.hatsByTarget[hat.target]!.push(hat);
  }

  /** Milliseconds since the project started, on the configured clock. */
  now(): number {
    if (this.options.clock === "virtual") return (this.frame * 1000) / this.options.fps;
    return performance.now() - this.startTime;
  }

  // ---- starting scripts ----

  private start(hat: Hat): Thread | undefined {
    // A hat that does not restart its script (`when key pressed`) is not started again while the
    // script runs. Once it has finished, the new run goes at the end of the list like any new
    // thread, even if the finished one is still listed, as in TurboWarp.
    if (hat.restart === false) {
      if (this.threads.some((old) => old.hat === hat && !old.done)) return undefined;
      return this.push(new Thread(hat, this.targets[hat.target]!));
    }
    const th = new Thread(hat, this.targets[hat.target]!);
    // Re-triggering a hat restarts its script in the same place in the thread list, like
    // TurboWarp, so the new run waits for the next pass if that place is behind. That includes a
    // run that finished earlier in this pass: TurboWarp only forgets a thread when the pass ends,
    // and so does `tick`. There is at most one thread per restarting hat in the list.
    const i = this.threads.findIndex((old) => old.hat === hat);
    if (i >= 0) {
      this.threads[i]!.done = true;
      this.threads[i] = th;
      this.spin = 0;
      return th;
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
   * Starts the hats for `kind` and `arg` in TurboWarp's order: targets from the top layer down
   * with the stage last, and within a target in the order its scripts appear.
   */
  private startHats(kind: HatKind, arg?: string): Thread[] {
    const started: Thread[] = [];
    for (const hat of this.ordered ?? this.orderHats()) {
      if (hat.kind !== kind || (arg !== undefined && hat.arg !== arg)) continue;
      const th = this.start(hat);
      if (th) started.push(th);
    }
    return started;
  }

  /** Sorts every hat into start order; done again after a layer change. */
  private orderHats(): Hat[] {
    const order = this.targets.map((_, i) => i);
    // Ties keep TurboWarp's order too: the later target in project.json runs first.
    order.sort((a, b) => this.targets[b]!.layer - this.targets[a]!.layer || b - a);
    this.ordered = order.flatMap((i) => this.hatsByTarget[i]!);
    return this.ordered;
  }

  greenFlag(): void {
    this.stopAll();
    this.timerStart = this.now();
    this.startHats("flag");
  }

  broadcast(name: Value): Thread[] {
    return this.startHats("broadcast", ops.toStr(name).toLowerCase());
  }

  *broadcastAndWait(name: Value): Generator<unknown, void, unknown> {
    const started = this.broadcast(name);
    do yield WAIT;
    while (started.some((th) => !th.done));
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
    for (const hat of this.hatsByTarget[this.targets.indexOf(target)] ?? []) {
      if (hat.kind === "click") this.start(hat);
    }
  }

  stopAll(): void {
    for (const th of this.threads) th.done = true;
    this.threads = [];
    this.spin = 0;
    for (const t of this.targets) {
      t.bubble = null;
      t.bubbleDrawn = false;
    }
  }

  stopOthers(t: Target, self: Thread): void {
    for (const th of this.threads) if (th.target === t && th !== self) th.done = true;
    this.spin = 0;
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

  get running(): boolean {
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

  // ---- block helpers used by generated code ----
  // One-line delegates to the plain functions in `lib/`; a later change makes generated code
  // call those directly and removes this group.

  *wait(seconds: number): Generator<unknown, void, unknown> { yield* wait(this, seconds); }
  timer(): number { return timer(this); }
  resetTimer(): void { resetTimer(this); }
  *ask(t: Target, question: Value): Generator<unknown, void, unknown> { yield* ask(this, t, question); }
  keyPressed(key: Value): boolean { return keyPressed(this, key); }
  daysSince2000(): number { return daysSince2000(); }

  say(t: Target, kind: "say" | "think", text: Value): void { say(this, t, kind, text); }
  *sayFor(t: Target, kind: "say" | "think", text: Value, seconds: number): Generator<unknown, void, unknown> { yield* sayFor(this, t, kind, text, seconds); }
  switchCostume(t: Target, value: Value): void { switchCostume(this, t, value); }
  nextCostume(t: Target): void { nextCostume(this, t); }
  costumeName(t: Target): string { return costumeName(t); }
  setSize(t: Target, size: number): void { setSize(this, t, size); }
  setVisible(t: Target, visible: boolean): void { setVisible(this, t, visible); }
  goToFront(t: Target): void { goToFront(this, t); }

  setXY(t: Target, x: number, y: number): void { setXY(this, t, x, y); }
  move(t: Target, steps: number): void { move(this, t, steps); }
  setDirection(t: Target, dir: number): void { setDirection(this, t, dir); }
  *glide(t: Target, seconds: number, x: number, y: number): Generator<unknown, void, unknown> { yield* glide(this, t, seconds, x, y); }
  bounce(t: Target): void { bounce(this, t); }
  coord(n: number): number { return coord(n); }

  /** Reads the `log` list on the stage, the standard test output. */
  log(): string[] {
    const entry = Object.entries(this.project.targets[0].lists).find(([, [name]]) => name === "log");
    return entry ? (this.stage.l[entry[0]] ?? []).map(String) : [];
  }
}

import type { ProjectJson } from "@bytecat/sb3";
import * as ops from "./ops.js";
import { Target } from "./target.js";
import type { Value } from "./ops.js";

/**
 * A compiled script body. It yields `undefined` at the end of a loop iteration (the thread wants
 * to keep running) and `WAIT` while it is blocked on time or another thread.
 */
export type ScriptFn = (t: Target, th: Thread) => Generator<unknown, void, unknown>;

export type HatKind = "flag" | "broadcast" | "key" | "click";

export interface Hat {
  target: number; // index into project.targets
  kind: HatKind;
  /** Broadcast name (lowercase) or key name. */
  arg?: string;
  fn: ScriptFn;
}

/** The function the compiler emits: it receives the runtime and returns every hat script. */
export type ProgramFactory = (rt: Runtime) => Hat[];

export const WAIT = 1;
const STOP_ALL = Symbol("stop all");

export class Thread {
  done = false;
  /** Above zero while inside a "run without screen refresh" procedure. */
  warp = 0;
  readonly gen: Generator<unknown, void, unknown>;
  constructor(readonly hat: Hat, readonly target: Target) {
    this.gen = hat.fn(target, this);
  }
}

export interface RuntimeOptions {
  /** Skip the redraw that normally ends a frame after visible changes. Default false. */
  turbo?: boolean;
  /** Frames per second of the scheduler. Default 30. */
  fps?: number;
  /** "real" uses wall-clock time; "virtual" advances time by exactly one frame per tick. */
  clock?: "real" | "virtual";
  /** Answers for `ask` blocks when no UI is attached. */
  answers?: string[];
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
  /** Set by blocks that change what is on screen; ends the frame early unless in turbo mode. */
  redraw = false;
  answer = "";
  mouse = { x: 0, y: 0, down: false };
  readonly keys = new Set<string>();
  onAsk: ((question: string) => Promise<string>) | null = null;

  private readonly options: Required<Omit<RuntimeOptions, "answers">>;
  private readonly answers: string[];
  private frame = 0;
  private readonly startTime = performance.now();
  private timerStart = 0;

  constructor(readonly project: ProjectJson, program: ProgramFactory, options: RuntimeOptions = {}) {
    this.options = { turbo: false, fps: 30, clock: "real", ...options };
    this.answers = [...(options.answers ?? [])];
    this.targets = Target.all(project);
    this.stage = this.targets[0]!;
    this.hats = program(this);
  }

  /** Milliseconds since the project started, on the configured clock. */
  now(): number {
    if (this.options.clock === "virtual") return (this.frame * 1000) / this.options.fps;
    return performance.now() - this.startTime;
  }

  // ---- starting scripts ----

  private start(hat: Hat): Thread {
    const target = this.targets[hat.target]!;
    // Re-triggering a hat whose script is still running restarts it, like Scratch.
    const existing = this.threads.find((th) => th.hat === hat && !th.done);
    if (existing) existing.done = true;
    const th = new Thread(hat, target);
    this.threads.push(th);
    return th;
  }

  private startHats(kind: HatKind, arg?: string, target?: Target): Thread[] {
    const started: Thread[] = [];
    for (const hat of this.hats) {
      if (target && this.targets[hat.target] !== target) continue;
      if (hat.kind === kind && (arg === undefined || hat.arg === arg || (kind === "key" && hat.arg === "any"))) {
        started.push(this.start(hat));
      }
    }
    return started;
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

  keyDown(key: string): void {
    this.keys.add(key);
    this.startHats("key", key);
  }

  keyUp(key: string): void {
    this.keys.delete(key);
  }

  click(target: Target): void {
    this.startHats("click", undefined, target);
  }

  stopAll(): void {
    for (const th of this.threads) th.done = true;
    this.threads = [];
    for (const t of this.targets) t.bubble = null;
  }

  stopOthers(t: Target, self: Thread): void {
    for (const th of this.threads) if (th.target === t && th !== self) th.done = true;
  }

  // ---- scheduler ----

  /**
   * Runs one frame. Like Scratch, it keeps cycling through threads until most of the frame budget
   * is used, a redraw is requested (outside turbo mode), or every thread is blocked.
   */
  tick(): void {
    const budget = (1000 / this.options.fps) * 0.75;
    const frameStart = performance.now();
    this.redraw = false;
    for (;;) {
      let progressed = false;
      // Threads started during this pass run in the same pass, as in Scratch.
      for (let i = 0; i < this.threads.length; i++) {
        const th = this.threads[i]!;
        if (th.done) continue;
        if (this.step(th) !== WAIT) progressed = true;
      }
      this.threads = this.threads.filter((th) => !th.done);
      if (!progressed || this.threads.length === 0) break;
      if (this.redraw && !this.options.turbo) break;
      if (performance.now() - frameStart >= budget) break;
    }
    this.frame++;
  }

  private step(th: Thread): unknown {
    try {
      const r = th.gen.next();
      if (r.done) th.done = true;
      return r.value;
    } catch (e) {
      th.done = true;
      if (e === STOP_ALL) this.stopAll();
      else throw e;
      return undefined;
    }
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

  *wait(seconds: number): Generator<unknown, void, unknown> {
    const end = this.now() + seconds * 1000;
    this.redraw = true;
    do yield WAIT;
    while (this.now() < end);
  }

  timer(): number {
    return (this.now() - this.timerStart) / 1000;
  }

  resetTimer(): void {
    this.timerStart = this.now();
  }

  *ask(t: Target, question: Value): Generator<unknown, void, unknown> {
    if (!t.isStage) this.say(t, "say", question);
    if (this.onAsk) {
      let result: string | null = null;
      this.onAsk(ops.toStr(question)).then((a) => (result = a));
      while (result === null) yield WAIT;
      this.answer = result;
    } else {
      this.answer = this.answers.shift() ?? "";
      yield WAIT;
    }
    if (!t.isStage) this.say(t, "say", "");
  }

  say(t: Target, kind: "say" | "think", text: Value): void {
    const s = ops.toStr(text);
    t.bubble = s === "" ? null : { kind, text: s };
    if (s !== "") this.says.push({ target: t.name, kind, text: s });
    this.redraw = true;
  }

  *sayFor(t: Target, kind: "say" | "think", text: Value, seconds: number): Generator<unknown, void, unknown> {
    this.say(t, kind, text);
    const bubble = t.bubble;
    yield* this.wait(seconds);
    if (t.bubble === bubble) this.say(t, kind, "");
  }

  // motion

  setXY(t: Target, x: number, y: number): void {
    t.x = x;
    t.y = y;
    if (t.visible) this.redraw = true;
  }

  move(t: Target, steps: number): void {
    const rad = ((90 - t.direction) * Math.PI) / 180;
    this.setXY(t, t.x + steps * Math.cos(rad), t.y + steps * Math.sin(rad));
  }

  setDirection(t: Target, dir: number): void {
    if (!Number.isFinite(dir)) return;
    t.direction = ops.mod(dir + 179, 360) - 179;
    if (t.visible) this.redraw = true;
  }

  *glide(t: Target, seconds: number, x: number, y: number): Generator<unknown, void, unknown> {
    const start = this.now();
    const duration = seconds * 1000;
    const x0 = t.x;
    const y0 = t.y;
    for (;;) {
      const frac = duration <= 0 ? 1 : (this.now() - start) / duration;
      if (frac >= 1) break;
      this.setXY(t, x0 + (x - x0) * frac, y0 + (y - y0) * frac);
      yield WAIT;
    }
    this.setXY(t, x, y);
  }

  bounce(t: Target): void {
    // Approximation: treats the sprite as a point. Real bounds need the renderer.
    let dir = t.direction;
    if (t.x > 240 || t.x < -240) dir = -dir;
    if (t.y > 180 || t.y < -180) dir = 180 - dir;
    this.setXY(t, Math.max(-240, Math.min(240, t.x)), Math.max(-180, Math.min(180, t.y)));
    this.setDirection(t, dir);
  }

  /** Scratch hides floating-point noise in x/y reporters. */
  coord(n: number): number {
    const r = Math.round(n);
    return Math.abs(n - r) < 1e-9 ? r : n;
  }

  // looks

  switchCostume(t: Target, value: Value): void {
    const i = t.costumes.findIndex((c) => c.name === value);
    if (i >= 0) t.costume = i;
    else if (value === "next costume" || value === "next backdrop") t.costume = (t.costume + 1) % t.costumes.length;
    else if (value === "previous costume" || value === "previous backdrop") t.costume = ops.mod(t.costume - 1, t.costumes.length);
    else if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
      t.costume = ops.mod(Math.round(ops.toNum(value)) - 1, t.costumes.length);
    }
    this.redraw = true;
  }

  nextCostume(t: Target): void {
    t.costume = (t.costume + 1) % t.costumes.length;
    this.redraw = true;
  }

  costumeName(t: Target): string {
    return t.costumes[t.costume]?.name ?? "";
  }

  setSize(t: Target, size: number): void {
    t.size = Math.max(5, size);
    if (t.visible) this.redraw = true;
  }

  setVisible(t: Target, visible: boolean): void {
    t.visible = visible;
    this.redraw = true;
  }

  goToFront(t: Target): void {
    const top = Math.max(...this.targets.map((x) => x.layer));
    if (t.layer !== top) t.layer = top + 1;
    this.redraw = true;
  }

  // sensing

  keyPressed(key: Value): boolean {
    const k = ops.toStr(key).toLowerCase();
    if (k === "any") return this.keys.size > 0;
    return this.keys.has(k);
  }

  daysSince2000(): number {
    return (Date.now() - Date.UTC(2000, 0, 1)) / 86_400_000;
  }

  /** Reads the `log` list on the stage, the standard test output. */
  log(): string[] {
    const entry = Object.entries(this.project.targets[0].lists).find(([, [name]]) => name === "log");
    return entry ? (this.stage.l[entry[0]] ?? []).map(String) : [];
  }
}

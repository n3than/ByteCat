// The scheduler's treatment of loop yields. Hand-written scripts mimic what the compiler emits at
// the end of a loop iteration: `if (th.warp === 0 && --rt.spin < 0) yield;`.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { Runtime, type Hat, type RuntimeOptions, type ScriptFn, type Thread } from "../src/index.js";

const project = {
  targets: [
    {
      isStage: true,
      name: "Stage",
      variables: {},
      lists: {},
      costumes: [],
      currentCostume: 0,
      layerOrder: 0,
    },
  ],
} as unknown as ProjectJson;

interface Counter {
  /** How many times the scheduler stepped each script (its first step included). */
  steps: Record<string, number>;
  events: string[];
}

/** A script wrapper that counts how often the scheduler resumes it. */
function counted(counter: Counter, name: string, fn: ScriptFn): ScriptFn {
  counter.steps[name] = 0;
  return function* (t, th) {
    const g = fn(t, th);
    for (;;) {
      counter.steps[name]!++;
      const r = g.next();
      if (r.done) return;
      yield r.value;
    }
  };
}

/**
 * A fake scheduler clock: scripts advance it by the time their work would take, so frame timing is
 * deterministic and independent of the machine.
 */
function fakeClock() {
  const clock = { now: 0, read: () => clock.now };
  return clock;
}

function setup(
  options: RuntimeOptions,
  scripts: (rt: Runtime, c: Counter) => { name: string; kind?: Hat["kind"]; arg?: string; fn: ScriptFn }[],
) {
  const c: Counter = { steps: {}, events: [] };
  const rt = new Runtime(
    project,
    (rt) => scripts(rt, c).map(({ name, kind, arg, fn }) => ({ target: 0, kind: kind ?? "flag", ...(arg ? { arg } : {}), fn: counted(c, name, fn) })),
    // Work costs no time unless a test says otherwise, so every interval counts as light.
    { clock: "virtual", schedulerClock: () => 0, ...options },
  );
  return { rt, c };
}

/** A loop of `n` iterations; `body(i)` runs before the loop yield the compiler emits. */
function loop(rt: Runtime, n: number, body: (i: number, th: Thread) => void): ScriptFn {
  return function* (_t, th) {
    for (let i = 0; i < n; i++) {
      body(i, th);
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
  };
}

function runToEnd(rt: Runtime): number {
  let ticks = 0;
  rt.greenFlag();
  while (rt.running && ticks < 100_000) {
    rt.tick();
    ticks++;
  }
  expect(rt.running).toBe(false);
  return ticks;
}

describe("loop yields", () => {
  it("are skipped while a thread runs alone", () => {
    let count = 0;
    const { rt, c } = setup({ turbo: true }, (rt) => [{ name: "a", fn: loop(rt, 200_000, () => count++) }]);
    runToEnd(rt);
    expect(count).toBe(200_000);
    // Without the skip the scheduler would resume the thread once per iteration.
    expect(c.steps.a).toBeLessThan(2_000);
  });

  it("stay bounded when a lone loop turns heavy, so a frame ends near its budget", () => {
    // 290000 iterations of 0.1 µs each, then 10000 of 1 ms each. With a limit that grew while
    // the loop was cheap, one step would run thousands of heavy iterations before the clock is
    // read again.
    const clock = fakeClock();
    const { rt } = setup({ turbo: true, schedulerClock: clock.read }, (rt) => [
      { name: "a", fn: loop(rt, 300_000, (i) => (clock.now += i < 290_000 ? 0.0001 : 1)) },
    ]);
    rt.greenFlag();
    const budget = (1000 / 30) * 0.75;
    let longest = 0;
    while (rt.running) {
      const start = clock.now;
      rt.tick();
      longest = Math.max(longest, clock.now - start);
    }
    // At most 128 iterations (128 ms here) run between two clock reads.
    expect(longest).toBeLessThanOrEqual(budget + 128);
  });

  it("never happen in warp mode", () => {
    const { rt, c } = setup({ turbo: true }, (rt) => [
      {
        name: "a",
        fn: function* (_t, th) {
          th.warp++;
          for (let i = 0; i < 50; i++) if (th.warp === 0 && --rt.spin < 0) yield;
          th.warp--;
        },
      },
    ]);
    runToEnd(rt);
    expect(c.steps.a).toBe(1);
  });

  it("happen on every iteration while a second thread exists", () => {
    const { rt, c } = setup({ turbo: true }, (rt, c) => [
      { name: "a", fn: loop(rt, 300, (i) => c.events.push(`a${i}`)) },
      { name: "b", fn: loop(rt, 300, (i) => c.events.push(`b${i}`)) },
    ]);
    runToEnd(rt);
    expect(c.steps.a).toBe(301);
    expect(c.steps.b).toBe(301);
    const expected = Array.from({ length: 300 }, (_, i) => [`a${i}`, `b${i}`]).flat();
    expect(c.events).toEqual(expected);
  });

  it("keep alternating after one of two threads finishes, then are skipped again", () => {
    const { rt, c } = setup({ turbo: true }, (rt, c) => [
      { name: "long", fn: loop(rt, 100_000, (i) => i < 4 && c.events.push(`long${i}`)) },
      { name: "short", fn: loop(rt, 3, (i) => c.events.push(`short${i}`)) },
    ]);
    runToEnd(rt);
    expect(c.events.slice(0, 7)).toEqual(["long0", "short0", "long1", "short1", "long2", "short2", "long3"]);
    expect(c.steps.long).toBeLessThan(2_000);
  });

  it("let a thread started from inside a spinning loop run in the same pass", () => {
    const from = 19_990;
    const { rt, c } = setup({ turbo: true }, (rt, c) => [
      {
        name: "a",
        fn: loop(rt, 20_000, (i) => {
          if (i === from) rt.broadcast("go");
          if (i >= from) c.events.push(`a${i}`);
        }),
      },
      { name: "b", kind: "broadcast", arg: "go", fn: loop(rt, 5, (i) => c.events.push(`b${i}`)) },
    ]);
    // The broadcast hat has no running thread yet, so `a` runs alone until it starts one.
    runToEnd(rt);
    expect(c.steps.a).toBeLessThan(from / 2 + 20);
    expect(c.events.slice(0, 11)).toEqual(["a19990", "b0", "a19991", "b1", "a19992", "b2", "a19993", "b3", "a19994", "b4", "a19995"]);
  });
});

describe("requestRedraw", () => {
  it("ends the spin outside turbo mode", () => {
    const { rt } = setup({ turbo: false }, () => []);
    rt.spin = 50;
    expect(rt.redraw).toBe(false);
    rt.requestRedraw();
    expect(rt.redraw).toBe(true);
    expect(rt.spin).toBe(0);
  });

  it("does not end the spin in turbo mode", () => {
    const { rt } = setup({ turbo: true }, () => []);
    rt.spin = 50;
    rt.requestRedraw();
    expect(rt.redraw).toBe(true);
    expect(rt.spin).toBe(50);
  });

  it("makes a loop that draws yield every iteration, one iteration per frame", () => {
    const { rt, c } = setup({ turbo: false }, (rt) => [{ name: "a", fn: loop(rt, 40, () => rt.requestRedraw()) }]);
    const ticks = runToEnd(rt);
    expect(c.steps.a).toBe(41);
    // Every iteration draws, which ends the frame; the thread ends in the frame after the last.
    expect(ticks).toBe(41);
  });

  it("is reached by the blocks that change what is on screen", () => {
    const { rt } = setup({ turbo: false }, () => []);
    const t = rt.stage;
    const calls: (() => void)[] = [
      () => rt.say(t, "say", "hi"),
      () => rt.switchCostume(t, 1),
      () => rt.setVisible(t, true),
      () => rt.goToFront(t),
    ];
    for (const call of calls) {
      rt.spin = 9;
      rt.redraw = false;
      call();
      expect(rt.redraw).toBe(true);
      expect(rt.spin).toBe(0);
    }
  });
});

describe("spin", () => {
  it("is reset when the thread set changes", () => {
    const { rt } = setup({ turbo: true }, () => [{ name: "a", fn: function* () {} }]);
    rt.spin = 7;
    rt.stopAll();
    expect(rt.spin).toBe(0);
    rt.spin = 7;
    rt.stopOthers(rt.stage, { done: false } as Thread);
    expect(rt.spin).toBe(0);
    rt.spin = 7;
    rt.greenFlag();
    expect(rt.spin).toBe(0);
  });
});

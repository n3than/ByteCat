// The trace oracle (docs/testing.md): every example and benchmark runs on Bytecat and TurboWarp in
// lockstep and must show the same state after every frame, with its scripted input. Small pass
// budgets move the frame boundaries around, so the comparison also covers frames that the budget
// (not a redraw) ends. The other tests check that the oracle can fail and that its determinism
// holds.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compile, compileToSb3 } from "@bytecat/pseudo";
import { TurboWarpLockstep, turbowarpUsesCounterIds } from "@bytecat/reference";
import { readSb3 } from "@bytecat/sb3";
import {
  BytecatLockstep,
  describeTrace,
  parseInput,
  traceEngines,
  traceProject,
  TurboWarpEngine,
  type LockstepEngine,
  type TraceOptions,
} from "@bytecat/trace";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const projects = ["examples", "bench"].flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".sbp"))
    .sort()
    .map((f) => ({ dir, name: f.replace(/\.sbp$/, ""), path: join(root, dir, f) })),
);

const sb3Of = (source: string, name = "test.sbp") => compileToSb3(source, name);

describe("trace oracle agrees with TurboWarp", () => {
  // 300 frames is 10 seconds at 30 fps: every example ends sooner; pingpong and yield_loop run on.
  for (const passes of [50, 7, 1]) {
    describe(`with ${passes} passes per frame`, () => {
      for (const p of projects) {
        it(`${p.dir}/${p.name}`, async () => {
          const inputPath = p.path.replace(/\.sbp$/, ".input");
          const input = existsSync(inputPath) ? parseInput(readFileSync(inputPath, "utf8"), inputPath) : [];
          const r = await traceProject(sb3Of(readFileSync(p.path, "utf8"), p.name), { frames: 300, passes, input });
          expect(r.problems, describeTrace(r)).toEqual([]);
          expect(r.diff, describeTrace(r)).toBeNull();
          expect(r.frames).toBeGreaterThan(0);
        });
      }
    });
  }
});

describe("trace oracle", () => {
  const moving = `sprite Mover:\n  position -100, 0\n  when flag:\n    repeat 20:\n      move(10)\n`;

  it("catches a planted difference at its frame and field", async () => {
    const sb3 = sb3Of(moving);
    const bytecat = new BytecatLockstep(readSb3(sb3).json);
    const target = bytecat.rt.targets[1]!;
    let frame = 0;
    // A Bytecat that moves the sprite one step too far in its fifth frame.
    const planted: LockstepEngine = Object.assign(Object.create(bytecat) as BytecatLockstep, {
      step() {
        bytecat.step();
        if (++frame === 5) target.x += 1;
      },
      snapshot: (f: number) => bytecat.snapshot(f),
    });
    const turbowarp = await TurboWarpEngine.load(sb3);
    const r = await traceEngines(planted, turbowarp, { frames: 50 });
    expect(r.diff).toEqual({ frame: 5, field: "Mover.x", actual: "-49", expected: "-50" });
    expect(r.agreed?.expected.fields["Mover.x"]).toBe("-60");
    expect(describeTrace(r)).toContain('first difference at frame 5, Mover.x: bytecat "-49" but turbowarp "-50"');
  });

  it("paces a drawing loop at one iteration per frame on both engines", async () => {
    const r = await traceProject(sb3Of(moving), { frames: 50 });
    expect(r.diff).toBeNull();
    expect(r.frames).toBe(21); // 20 moves, then the frame in which the script ends
    expect(r.expected.fields["Mover.x"]).toBe("100");
  });

  it("draws pick random from the same seeded generator on both engines", async () => {
    const source = `var r = 0\nstage:\n  when flag:\n    repeat 30:\n      r = random(1, 1000000)\n      log(r)\n      log(random(0.5, 2))\n`;
    const options: TraceOptions = { frames: 100, passes: 3 };
    expect((await traceProject(sb3Of(source), options)).diff).toBeNull();
    // Different seeds must differ, or the generator would not be reaching both engines.
    const sb3 = sb3Of(source);
    const r = await traceEngines(new BytecatLockstep(readSb3(sb3).json, { seed: 1 }), await TurboWarpEngine.load(sb3, { seed: 2 }), options);
    expect(r.diff?.field).toBe("Stage.var.r");
  });

  it("pins the date and the timer to the virtual clock", async () => {
    const source = `stage:\n  when flag:\n    log(days_since_2000())\n    wait(0.5)\n    log(timer())\n    log(days_since_2000())\n`;
    const r = await traceProject(sb3Of(source), { frames: 100, date: Date.UTC(2026, 0, 1) });
    expect(r.diff).toBeNull();
    const log = r.expected.fields["Stage.list.log"] as string[];
    expect(log[0]).toBe("9497");
    expect(Number(log[1])).toBeGreaterThanOrEqual(0.5);
    expect(Number(log[2]) - 9497).toBeCloseTo(Number(log[1]) / 86400, 9);
  });

  it("checks waits again within the frame, like TurboWarp's compiled waits", async () => {
    const r = await traceProject(sb3Of(readFileSync(join(root, "examples", "wait_recheck.sbp"), "utf8")), { frames: 10 });
    expect(r.diff, describeTrace(r)).toBeNull();
    expect(r.frames).toBe(1);
    expect(r.expected.fields["Stage.list.log"]).toEqual(["a", "b"]);
  });

  it("passes wait(0) within the frame in turbo mode", async () => {
    const source = `var n = 0\nstage:\n  when flag:\n    repeat 10:\n      wait(0)\n      n += 1\n`;
    const r = await traceProject(sb3Of(source), { frames: 1, turbo: true });
    expect(r.diff, describeTrace(r)).toBeNull();
    expect(r.expected.fields["Stage.var.n"]).toBe("10");
  });

  it("ends a frame when the only threads left to go on have ended", async () => {
    // "again" restarts the "go" script in its place, behind it, and ends; the asking thread does
    // not keep the frame going either, so the restarted script first runs in frame 2.
    const source = `var n = 0\nstage:\n  when flag:\n    broadcast("go")\n    broadcast("again")\n  when receive "go":\n    n += 1\n    ask("q")\n  when receive "again":\n    broadcast("go")\n`;
    const r = await traceProject(sb3Of(source), { frames: 1 });
    expect(r.diff, describeTrace(r)).toBeNull();
    expect(r.expected.fields["Stage.var.n"]).toBe("1");
  });

  it("goes on after a pass where a thread ended while the others sleep", async () => {
    // In frame 2 the key script restarts the "go" script in its place, behind it, and ends.
    // The sleeping wait keeps TurboWarp's frame going, so the restarted script runs in frame 2.
    const source = `var n = 0\nstage:\n  when receive "go":\n    n += 1\n    wait(10)\n  when flag:\n    broadcast("go")\n  when key "space":\n    broadcast("go")\n`;
    const r = await traceProject(sb3Of(source), { frames: 2, input: parseInput("press space\n") });
    expect(r.diff, describeTrace(r)).toBeNull();
    expect(r.expected.fields["Stage.var.n"]).toBe("2");
  });

  describe("say for secs, which TurboWarp ends from a timer between frames", () => {
    const sprite = (scripts: string) => `var n = 0\nsprite S:\n  costume c = circle "#ff0000"\n${scripts}`;
    const cases: Record<string, string> = {
      // The review's repro: the clear in frame 7 must not end that frame early.
      repro: `var n = 0\nstage:\n  when receive "go":\n    n += 1\n    log(join(n, join(" ", timer())))\nsprite S:\n  costume c = circle "#ff0000"\n  when flag:\n    say("hi", 0.1)\n  when flag:\n    repeat 3:\n      wait(0.07)\n      broadcast("go")\n`,
      replaced: sprite(`  when flag:\n    say("first", 0.3)\n    log("done")\n  when flag:\n    wait(0.1)\n    say("second")\n    repeat 20:\n      n += 1\n`),
      // The timer of a stopped script still clears its bubble.
      "stop others": sprite(`  when flag:\n    say("hi", 0.3)\n    log("never")\n  when flag:\n    wait(0.1)\n    stop("other scripts in sprite")\n    repeat 30:\n      n += 1\n`),
      "stop all": sprite(`  when flag:\n    say("hi", 0.5)\n    log("never")\n  when flag:\n    wait(0.2)\n    stop("all")\n  when flag:\n    think("hm", 1)\n`),
      // 3000000 s is past the longest timer delay, which then waits 1 ms, in Node and in browsers.
      "hidden, zero, negative and too long": sprite(`  when flag:\n    hide()\n    think("hm", 0.2)\n    show()\n    say("x", 0)\n    say("y", -1)\n    say("z", 3000000)\n    log("done")\n  when flag:\n    repeat 40:\n      n += 1\n`),
      "broadcast and wait": sprite(`  when receive "talk":\n    say("hello", 0.2)\n  when flag:\n    broadcast_wait("talk")\n    log("talked")\n  when flag:\n    repeat 30:\n      n += 1\n`),
    };
    for (const [name, source] of Object.entries(cases)) {
      for (const turbo of [false, true]) {
        it(`${name}${turbo ? " in turbo mode" : ""}`, async () => {
          // Run on after the scripts end: a timer can still clear a bubble then.
          for (const passes of [50, 1]) {
            const r = await traceProject(sb3Of(source), { frames: 40, passes, turbo, untilDone: false });
            expect(r.problems, describeTrace(r)).toEqual([]);
            expect(r.diff, describeTrace(r)).toBeNull();
            expect(r.frames).toBe(40);
          }
        });
      }
    }

    it("counts a pending timer as running, so the trace compares the clear after the scripts end", async () => {
      // Both scripts end by frame 4; the timer clears the bubble at 0.5 s, before frame 16.
      const source = sprite(`  when flag:\n    say("hi", 0.5)\n  when flag:\n    wait(0.1)\n    stop("other scripts in sprite")\n`);
      const r = await traceProject(sb3Of(source), { frames: 40 });
      expect(r.diff, describeTrace(r)).toBeNull();
      expect(r.frames).toBe(16);
      expect(r.agreed).toBeUndefined();
      expect([r.actual.fields["S.bubble"], r.expected.fields["S.bubble"]]).toEqual(["", ""]);
      expect(r.running).toEqual({ actual: false, expected: false });
      const before = await traceProject(sb3Of(source), { frames: 15 });
      expect([before.actual.fields["S.bubble"], before.expected.fields["S.bubble"]]).toEqual(["say: hi", "say: hi"]);
      expect(before.running).toEqual({ actual: true, expected: true });
    });

    it("keeps the timers stop all leaves, as TurboWarp clears only the last one", async () => {
      const source = `stage:\n  when flag:\n    wait(0.1)\n    stop("all")\nsprite A:\n  costume c = circle "#ff0000"\n  when flag:\n    say("a", 0.5)\nsprite B:\n  costume c = circle "#00ff00"\n  when flag:\n    think("b", 1)\n`;
      const early = await traceProject(sb3Of(source), { frames: 10 });
      expect(early.diff, describeTrace(early)).toBeNull();
      expect(early.running).toEqual({ actual: true, expected: true });
      const r = await traceProject(sb3Of(source), { frames: 60 });
      expect(r.diff, describeTrace(r)).toBeNull();
      expect(r.running).toEqual({ actual: false, expected: false });
    });

    it("keeps the review's repro broadcasting in the frame of the clear", async () => {
      const r = await traceProject(sb3Of(cases.repro!), { frames: 7 });
      expect(r.diff, describeTrace(r)).toBeNull();
      expect(r.expected.fields["Stage.var.n"]).toBe("2");
      expect(r.expected.fields["S.bubble"]).toBe("");
    });
  });

  it("gives the threads after a stop all their step in that pass", async () => {
    const r = await traceProject(sb3Of(readFileSync(join(root, "examples", "stop_all_pass.sbp"), "utf8")), { frames: 10 });
    expect(r.diff, describeTrace(r)).toBeNull();
    expect(r.expected.fields["Stage.var.n"]).toBe("2");
    expect(r.expected.fields["Stage.list.log"]).toEqual(["1"]);
  });

  it("delivers keys, clicks, mouse moves and answers at frame boundaries", async () => {
    const source = readFileSync(join(root, "examples", "input.sbp"), "utf8");
    const input = parseInput(readFileSync(join(root, "examples", "input.input"), "utf8"));
    const r = await traceProject(sb3Of(source), { frames: 100, input });
    expect(r.diff).toBeNull();
    expect(r.running).toEqual({ actual: false, expected: false });
  });
});

describe("TurboWarp lockstep driver", () => {
  const counter = `var n = 0\nstage:\n  when flag:\n    forever:\n      n += 1\n`;
  const value = (tw: TurboWarpLockstep) => {
    const stage = (tw.runtime.targets as { isStage: boolean; variables: Record<string, { name: string; value: unknown }> }[]).find((t) => t.isStage)!;
    return Object.values(stage.variables).find((v) => v.name === "n")!.value;
  };

  it("runs exactly the pass budget in a frame nothing ends early", async () => {
    const tw = await TurboWarpLockstep.load(sb3Of(counter), { passes: 7 });
    await tw.step();
    expect(value(tw)).toBe(7);
    await tw.step();
    expect(value(tw)).toBe(14);
    tw.dispose();
  });

  it("ends a frame on a redraw, as with a renderer, except in turbo mode", async () => {
    const sb3 = sb3Of(`var n = 0\nsprite Cat:\n  when flag:\n    forever:\n      n += 1\n      change_x(1)\n`);
    for (const [turbo, expected] of [[false, 1], [true, 7]] as const) {
      const tw = await TurboWarpLockstep.load(sb3, { passes: 7, turbo });
      await tw.step();
      expect(value(tw)).toBe(expected);
      tw.dispose();
    }
  });

  it("makes TurboWarp's ids from a counter, so they never draw from Math.random", () => {
    expect(turbowarpUsesCounterIds()).toBe(true);
  });

  it("agrees with Bytecat on the pass budget, with spin pinned to 0", async () => {
    const json = compile(counter).project.json;
    const bytecat = new BytecatLockstep(json, { passes: 7 });
    bytecat.step();
    expect(bytecat.snapshot(1).fields["Stage.var.n"]).toBe("7");
  });
});

// Checks on generated code and on the scheduler that the example logs cannot see.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@bytecat/compiler";
import { compile as compilePseudo } from "@bytecat/pseudo";
import { Runtime } from "@bytecat/runtime";
import { describe, expect, it } from "vitest";

const code = (path: string) =>
  compile(compilePseudo(readFileSync(join(import.meta.dirname, "..", path), "utf8"), path).project.json).code;

describe("custom blocks", () => {
  it("compiles procedures that never yield to plain functions", () => {
    const js = code("examples/procedures.sbp");
    // add and count never yield. step loops outside warp, fast calls step, pause and is_odd
    // wait, and is_even calls is_odd.
    expect(js.match(/^function p/gm)).toHaveLength(2);
    expect(js.match(/^function\* p/gm)).toHaveLength(5);
  });

  it("calls a plain function without yield* or warp bookkeeping", () => {
    const js = code("bench/recursion.sbp");
    expect(js).toMatch(/^function p1_0\(t, th, a0\)/m);
    expect(js).not.toContain("yield*");
    expect(js).not.toContain("th.warp");
  });
});

describe("scheduler", () => {
  it("ends a frame near its budget while a script yields on every iteration", () => {
    const source = "sprite Main:\n  when flag:\n    forever:\n      x += 1\n";
    const json = compilePseudo(`var x = 0\n${source}`, "forever.sbp").project.json;
    // The scheduler's clock counts iterations, 10 µs each, so the test does not depend on how
    // fast the machine is. It reads x, which the script stores before every yield.
    let rt: Runtime | undefined = undefined;
    const now = () => Number(Object.values(rt!.stage.v)[0]) * 0.01;
    rt = new Runtime(json, compile(json).program, { clock: "virtual", turbo: true, fps: 60, schedulerClock: now });
    rt.greenFlag();
    for (let i = 0; i < 20; i++) {
      const start = now();
      rt.tick();
      // The budget is 12.5 ms at 60 fps; the clock is read often enough to stop close to it.
      expect(now() - start).toBeGreaterThan(12.5);
      expect(now() - start).toBeLessThan(18);
    }
    expect(rt.running).toBe(true);
  });

  it("keeps frames near the budget when cheap passes turn heavy", () => {
    // Two cheap threads run thousands of passes, so the clock stride reaches its cap. Then two
    // heavy threads start mid-frame, each pass costing most of a millisecond. The scheduler must
    // notice the heavier passes straight away and bring the stride back down. Two threads of each
    // kind, because the stride only grows while two or more threads run, so it is what is tested.
    const source = `var x = 0
var z = 0
sprite Main:
  when flag:
    repeat 3000:
      x += 1
    broadcast("heavy")
sprite Other:
  when flag:
    repeat 3000:
      x += 1
sprite Heavy:
  define warp work():
    repeat 100:
      z += 1
  when receive "heavy":
    forever:
      work()
  when receive "heavy":
    forever:
      work()
`;
    const json = compilePseudo(source, "heavy.sbp").project.json;
    // The scheduler's clock is derived from the work done, so the test does not depend on how
    // fast the machine is: a cheap iteration (x) costs 0.1 µs, a heavy one (z) 8 µs, so a heavy
    // pass of 100 iterations costs 0.8 ms. The variables are the stage's, in declaration order.
    let rt: Runtime | undefined = undefined;
    const counts = () => Object.values(rt!.stage.v).map(Number) as [number, number];
    const now = () => {
      const [x, z] = counts();
      return x * 0.0001 + z * 0.008;
    };
    rt = new Runtime(json, compile(json).program, { clock: "virtual", turbo: true, fps: 60, schedulerClock: now });
    rt.greenFlag();
    for (let i = 0; i < 15; i++) {
      const start = now();
      rt.tick();
      // The budget is 12.5 ms at 60 fps. The first frame also holds the cheap passes (0.6 ms), and
      // a pass of both heavy threads costs 1.6 ms, so a frame that reads the clock after every
      // pass ends before 16 ms. A stride left at its cap of 128 would run about 200 ms.
      expect(now() - start, `tick ${i}`).toBeGreaterThan(12.5);
      expect(now() - start, `tick ${i}`).toBeLessThan(16);
    }
    // The cheap phase ended inside the test, and the heavy threads ran.
    const [x, z] = counts();
    expect(x).toBe(6000);
    expect(z).toBeGreaterThan(0);
  });
});

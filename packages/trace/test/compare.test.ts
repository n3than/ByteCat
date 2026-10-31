// The relaxed comparison without real engines: tolerances, the frame window, allowed differences,
// ignored paths and the mismatch report, on hand-made snapshots and scripted fake engines.
import { describe, expect, it } from "vitest";
import {
  checkConfig,
  compareCheckpoint,
  compareEngines,
  describeCompare,
  describeMismatch,
  sameValue,
  type FieldValue,
  type LockstepEngine,
  type Snapshot,
} from "../src/index.js";

const snap = (frame: number, fields: Record<string, FieldValue>): Snapshot => ({ frame, fields });

/** A fake engine that shows `at(frame)` after each frame and stops running after `end` frames. */
function scripted(name: string, at: (frame: number) => Record<string, FieldValue>, end = Infinity): LockstepEngine & { stepped: number } {
  let frame = 0;
  return {
    name,
    stepped: 0,
    step() {
      frame++;
      this.stepped = frame;
    },
    snapshot: (f: number) => snap(f, at(Math.min(frame, end))),
    get running() {
      return frame < end;
    },
    keyDown() {},
    keyUp() {},
    mouseMove() {},
    click() {},
    questions: [],
    answer() {},
    problems: [],
    dispose() {},
  };
}

describe("sameValue", () => {
  it("matches canonical numbers within the tolerance, and text exactly", () => {
    expect(sameValue("0.30000000000000004", "0.3")).toBe(true);
    expect(sameValue("100", "100.0000001")).toBe(true);
    expect(sameValue("100", "100.001")).toBe(false);
    expect(sameValue("100", "100.001", 0.01)).toBe(true);
    expect(sameValue("1e+21", "1.0000000001e+21")).toBe(true); // relative
    expect(sameValue("1.0", "1")).toBe(false); // "1.0" is text Scratch shows as is
    expect(sameValue("true", "1")).toBe(false);
    expect(sameValue("", "0")).toBe(false);
    expect(sameValue("Infinity", "Infinity")).toBe(true);
    expect(sameValue(["1", "2.0000000001"], ["1", "2"])).toBe(true);
    expect(sameValue(["1"], ["1", "2"])).toBe(false);
    expect(sameValue(undefined, "1")).toBe(false);
  });
});

describe("compareCheckpoint", () => {
  it("lets a value match TurboWarp at any frame of the window", () => {
    const mine = snap(10, { "Cat.x": "100" });
    const window = [8, 9, 10, 11, 12].map((f) => snap(f, { "Cat.x": String((f - 1) * 10) }));
    expect(compareCheckpoint(mine, window)).toBeNull(); // TurboWarp shows 30 one frame later
    const m = compareCheckpoint(snap(10, { "Cat.x": "200" }), window);
    expect(m).toMatchObject({ frame: 10, field: "Cat.x", actual: "200", window: [8, 12] });
    expect(m!.expected.map((e) => e.value)).toEqual(["70", "80", "90", "100", "110"]);
  });

  it("compares the clone count and the layer order, and fields only one engine has", () => {
    const tw = snap(5, { "Cat.x": "0", "Cat#1.x": "0", layers: ["Cat#1", "Cat"] });
    expect(compareCheckpoint(snap(5, { "Cat.x": "0" }), [snap(5, { "Cat.x": "0", "Cat#1.x": "0" })])?.field).toBe("Cat#1.x");
    expect(compareCheckpoint(snap(5, { "Cat.x": "0", "Cat#1.x": "0", layers: ["Cat", "Cat#1"] }), [tw])?.field).toBe("layers");
    const clones = compareCheckpoint(snap(5, { "Cat.x": "0", "Cat#1.costume": "1 c", "Cat#1.x": "0", layers: ["Cat#1", "Cat"] }), [snap(5, { ...tw.fields, "Cat#1.costume": "1 c", "Cat#2.costume": "1 c" })]);
    expect(clones).toMatchObject({ field: "clones", actual: "1" });
  });

  it("leaves out bubbles and rotation styles, and ignored paths", () => {
    const tw = snap(0, { "Cat.bubble": "say: 1.23", "Cat.rotationStyle": "all around", "Stage.var.n": "1", "Stage.list.log": ["a"] });
    expect(compareCheckpoint(snap(0, { "Cat.bubble": "say: 1.234", "Cat.rotationStyle": "left-right", "Stage.var.n": "1", "Stage.list.log": ["a"] }), [tw])).toBeNull();
    const mine = snap(0, { "Stage.var.n": "2", "Stage.list.log": ["b"] });
    expect(compareCheckpoint(mine, [tw])?.field).toBe("Stage.var.n");
    expect(compareCheckpoint(mine, [tw], { ignore: ["Stage.var.*", "Stage.list.log"] })).toBeNull();
  });

  it("names the first differing list item", () => {
    const m = compareCheckpoint(snap(3, { "Stage.list.log": ["a", "b", "c"] }), [snap(3, { "Stage.list.log": ["a", "x"] })]);
    expect(m).toMatchObject({ field: "Stage.list.log", index: 1 });
    expect(describeMismatch(m!)).toBe('frame 3, Stage.list.log[2]: bytecat "b" (length 3) but turbowarp "x" (length 2)');
  });

  describe("allowed differences", () => {
    const clones = (n: number, x = "0") => Object.fromEntries(Array.from({ length: n }, (_, i) => [[`S#${i + 1}.costume`, "1 c"], [`S#${i + 1}.x`, x]]).flat());

    it("lets Bytecat have more clones once TurboWarp is at 300", () => {
      const allowed = new Set<string>();
      const tw = snap(1, { ...clones(300), "S.x": "0", layers: ["tw"] });
      expect(compareCheckpoint(snap(1, { ...clones(310, "1"), "S.x": "0", layers: ["bytecat"] }), [tw], {}, allowed)).toBeNull();
      expect([...allowed]).toEqual(["clone-limit"]);
      // Other fields still count, and so do clones below the limit.
      expect(compareCheckpoint(snap(1, { ...clones(310), "S.x": "5", layers: ["tw"] }), [tw])?.field).toBe("S.x");
      expect(compareCheckpoint(snap(1, { ...clones(299) }), [snap(1, clones(298))])?.field).toBe("S#299.costume");
    });

    it("lets Bytecat make a sprite smaller than TurboWarp's minimum", () => {
      const allowed = new Set<string>();
      expect(compareCheckpoint(snap(1, { "S.size": "1" }), [snap(1, { "S.size": "10.416666666666668" })], {}, allowed)).toBeNull();
      expect([...allowed]).toEqual(["min-size"]);
      expect(compareCheckpoint(snap(1, { "S.size": "20" }), [snap(1, { "S.size": "10" })])?.field).toBe("S.size");
      expect(compareCheckpoint(snap(1, { "S.size": "5000" }), [snap(1, { "S.size": "1125" })])?.field).toBe("S.size");
    });
  });

  it("rejects unknown settings and allowances", () => {
    expect(() => checkConfig({ allow: ["clone-limit"], every: 5, window: 0 })).not.toThrow();
    expect(() => checkConfig({ allow: ["no-fencing"] }, "x.compare.json")).toThrow('x.compare.json: unknown allowance "no-fencing"');
    expect(() => checkConfig({ windows: 3 } as never)).toThrow('unknown setting "windows"');
    expect(() => checkConfig({ every: 0 })).toThrow('"every"');
  });
});

describe("compareEngines", () => {
  // A sprite moving 10 per frame for 50 frames.
  const moving = (lag: number, offset = 0) => (f: number) => ({ "Cat.x": String(Math.max(0, f - lag) * 10 + offset) });

  it("agrees when Bytecat runs up to `window` frames behind or ahead", async () => {
    for (const lag of [-2, -1, 1, 2]) {
      const r = await compareEngines(scripted("bytecat", moving(lag), 50 + lag), scripted("turbowarp", moving(0), 50), { frames: 300 });
      expect(r.mismatch, describeCompare(r)).toBeNull();
      expect(r.frames).toBe(Math.max(50, 50 + lag));
    }
  });

  it("reports a value off by more than the window, with both values and the frames searched", async () => {
    const r = await compareEngines(scripted("bytecat", moving(3), 53), scripted("turbowarp", moving(0), 50), { frames: 300 });
    expect(r.mismatch).toMatchObject({ frame: 10, field: "Cat.x", actual: "70", window: [8, 12] });
    expect(describeCompare(r)).toBe(
      'first mismatch at frame 10, Cat.x: bytecat "70" but turbowarp "100"; no match in frames 8..12, where turbowarp had "80", "90", "100", "110", ...',
    );
    // A wider window lets it through.
    const wide = await compareEngines(scripted("bytecat", moving(3), 53), scripted("turbowarp", moving(0), 50), { frames: 300, window: 3 });
    expect(wide.mismatch).toBeNull();
  });

  it("checks only at checkpoints, so a difference between them that goes away passes", async () => {
    const blip = (f: number) => ({ "Cat.x": f === 15 ? "999" : "0" });
    const r = await compareEngines(scripted("bytecat", blip, 30), scripted("turbowarp", () => ({ "Cat.x": "0" }), 30), { frames: 300 });
    expect(r.mismatch).toBeNull();
    expect(r.checkpoints).toBe(4); // frames 0, 10, 20 and 30
    const every = await compareEngines(scripted("bytecat", blip, 30), scripted("turbowarp", () => ({ "Cat.x": "0" }), 30), { frames: 300, every: 5, window: 0 });
    expect(every.mismatch).toMatchObject({ frame: 15, field: "Cat.x" });
  });

  it("compares the end state and whether each engine finished", async () => {
    const counter = (last: number) => (f: number) => ({ "Stage.var.n": String(Math.min(f, last)) });
    const end = await compareEngines(scripted("bytecat", counter(7), 7), scripted("turbowarp", counter(8), 8), { frames: 300 });
    expect(end.mismatch).toMatchObject({ frame: 8, field: "Stage.var.n", actual: "7" });
    const running = await compareEngines(scripted("bytecat", () => ({}), 5), scripted("turbowarp", () => ({})), { frames: 20 });
    expect(running.mismatch).toMatchObject({ frame: 20, field: "running", actual: "false" });
    expect(running.frames).toBe(20);
  });
});

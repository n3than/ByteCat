// The engine-free parts of the trace oracle: display normalization, snapshots, the differ and the
// input format.
import { describe, expect, it } from "vitest";
import {
  describeDiff,
  diffSnapshots,
  display,
  displayCoordinate,
  parseInput,
  schedule,
  toSnapshot,
  type Snapshot,
  type StageState,
} from "../src/index.js";

const state = (over: Partial<StageState["targets"][number]> = {}): StageState => ({
  targets: [
    { name: "Stage", isStage: true, variables: [["score", 0]], lists: [["log", []]], costume: 0, costumeName: "sky" },
    {
      name: "Cat",
      isStage: false,
      variables: [],
      lists: [],
      costume: 1,
      costumeName: "walk",
      x: 10,
      y: -5,
      direction: 90,
      size: 100,
      visible: true,
      rotationStyle: "all around",
      bubble: null,
      ...over,
    },
  ],
  layers: ["Cat"],
});

const snap = (frame: number, fields: Snapshot["fields"]): Snapshot => ({ frame, fields });

describe("display", () => {
  it("shows numbers and text the same way Scratch does", () => {
    expect(display(5)).toBe(display("5"));
    expect(display(-0)).toBe("0");
    expect(display(true)).toBe("true");
    expect(display(0.1 + 0.2)).toBe("0.30000000000000004");
  });

  it("rounds coordinates like TurboWarp's limitPrecision", () => {
    expect(displayCoordinate(10.0000000001)).toBe("10");
    expect(displayCoordinate(-3 - 1e-12)).toBe("-3");
    expect(displayCoordinate(10.001)).toBe("10.001");
  });
});

describe("toSnapshot", () => {
  it("names every field and formats bubbles and costumes", () => {
    const s = toSnapshot(3, state({ bubble: { kind: "think", text: "hm" } }));
    expect(s.frame).toBe(3);
    expect(s.fields).toMatchObject({
      "Stage.costume": "1 sky",
      "Stage.var.score": "0",
      "Stage.list.log": [],
      "Cat.costume": "2 walk",
      "Cat.x": "10",
      "Cat.y": "-5",
      "Cat.bubble": "think: hm",
      layers: ["Cat"],
    });
    expect(toSnapshot(0, state({ bubble: { kind: "say", text: "" } })).fields["Cat.bubble"]).toBe("");
  });

  it("makes a number and its text equal", () => {
    const a = toSnapshot(1, state({ x: 1e-10 }));
    const b = toSnapshot(1, state({ x: 0 }));
    expect(diffSnapshots(a, b)).toBeNull();
  });
});

describe("diffSnapshots", () => {
  it("is null for equal snapshots", () => {
    expect(diffSnapshots(snap(1, { a: "1", l: ["x"] }), snap(1, { a: "1", l: ["x"] }))).toBeNull();
  });

  it("reports the first differing field in order, with both values", () => {
    const d = diffSnapshots(snap(4, { a: "1", b: "2", c: "3" }), snap(4, { a: "1", b: "20", c: "30" }));
    expect(d).toEqual({ frame: 4, field: "b", actual: "2", expected: "20" });
    expect(describeDiff(d!)).toBe('frame 4, b: bytecat "2" but turbowarp "20"');
  });

  it("reports the first differing list item and both lengths", () => {
    const d = diffSnapshots(snap(2, { log: ["a", "b"] }), snap(2, { log: ["a", "b", "c"] }));
    expect(d).toEqual({ frame: 2, field: "log", index: 2, actual: undefined, expected: "c", lengths: [2, 3] });
    expect(describeDiff(d!)).toBe('frame 2, log[3]: bytecat <missing> but turbowarp "c" (lengths 2 and 3)');
  });

  it("reports fields only one side has", () => {
    expect(diffSnapshots(snap(0, { a: "1" }), snap(0, { a: "1", b: "2" }))).toEqual({ frame: 0, field: "b", actual: undefined, expected: "2" });
    expect(diffSnapshots(snap(0, { a: "1", b: "2" }), snap(0, { a: "1" }))?.field).toBe("b");
  });
});

describe("input", () => {
  it("parses every command", () => {
    const text = "// keys\npress left arrow\nrelease left arrow\n\nclick 10 -20\nmouse -240 180\nanswer Bob Smith\nanswer\nstep 3\n";
    expect(parseInput(text)).toEqual([
      { op: "press", key: "left arrow" },
      { op: "release", key: "left arrow" },
      { op: "click", x: 10, y: -20 },
      { op: "mouse", x: -240, y: 180 },
      { op: "answer", text: "Bob Smith" },
      { op: "answer", text: "" },
      { op: "step", n: 3 },
    ]);
  });

  it("rejects bad lines with the file and line", () => {
    expect(() => parseInput("press a\njump", "x.input")).toThrow(/x.input:2: bad input command "jump"/);
    expect(() => parseInput("mouse 300 0")).toThrow(/whole stage coordinates/);
    expect(() => parseInput("click 1.5 0")).toThrow(/whole stage coordinates/);
    expect(() => parseInput("step -1")).toThrow(/bad input command/);
  });

  it("applies each command before the next frame, and step N skips N frames", () => {
    const { events, lastFrame } = schedule(parseInput("press a\nstep 3\nrelease a\nanswer hi"));
    expect(events.map((e) => [e.frame, e.command.op])).toEqual([
      [2, "press"],
      [6, "release"],
      [7, "answer"],
    ]);
    expect(lastFrame).toBe(7);
  });
});

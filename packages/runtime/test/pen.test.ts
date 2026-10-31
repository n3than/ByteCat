import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { setXY } from "../src/lib/motion.js";
import { penDown, penOf, penUp, setPenColor, setPenParam, setPenSize, stamp } from "../src/lib/pen.js";
import { Runtime, type PenLayer } from "../src/runtime.js";
import { Target } from "../src/target.js";

function runtime(): Runtime {
  const sprite = { isStage: false, name: "S", variables: {}, lists: {}, broadcasts: {}, blocks: {}, costumes: [], currentCostume: 0, layerOrder: 1, x: 0, y: 0, direction: 90, size: 100, visible: true, rotationStyle: "all around", draggable: false };
  const stage = { ...sprite, isStage: true, name: "Stage", layerOrder: 0 };
  return new Runtime({ targets: [stage, sprite] } as unknown as ProjectJson, () => []);
}

describe("pen state", () => {
  it("starts blue with diameter 1, as TurboWarp's default", () => {
    const t = runtime().targets[1]!;
    expect(penOf(t)).toMatchObject({ down: false, color4f: [0, 0, 1, 1], size: 1 });
  });

  it("sets colors from hex, short hex, ARGB numbers and invalid hex like TurboWarp", () => {
    const t = runtime().targets[1]!;
    setPenColor(t, "#ff8000");
    // Through HSV and back with Scratch's flooring, 128 comes out as 127, as in TurboWarp.
    expect(penOf(t).color4f).toEqual([1, 127 / 255, 0, 1]);
    setPenColor(t, "#0f0");
    expect(penOf(t).color4f).toEqual([0, 1, 0, 1]);
    setPenColor(t, 0x80ff0000);
    expect(penOf(t).transparency).toBeCloseTo(100 * (1 - 128 / 255));
    expect(penOf(t).color4f[0]).toBe(1);
    setPenColor(t, "#nothex");
    expect(penOf(t).color4f).toEqual([0, 0, 0, 1]);
  });

  it("wraps the color parameter over 0 to 100 and clamps the others", () => {
    const t = runtime().targets[1]!;
    setPenParam(t, "color", 150, false);
    expect(penOf(t).color).toBe(49);
    setPenParam(t, "saturation", -20, true);
    expect(penOf(t).saturation).toBe(80);
    setPenParam(t, "transparency", 500, false);
    expect(penOf(t).color4f[3]).toBe(0);
    setPenParam(t, "nonsense", 5, false);
    expect(penOf(t).transparency).toBe(100);
    setPenSize(t, 0);
    expect(penOf(t).size).toBe(1);
    setPenSize(t, 5000);
    expect(penOf(t).size).toBe(1200);
  });
});

describe("pen drawing", () => {
  it("draws a dot on pen down and a line for each move while down, and asks for a redraw only with a layer", () => {
    const rt = runtime();
    const t = rt.targets[1]!;
    penDown(rt, t);
    setXY(rt, t, 10, 0);
    expect(rt.redraw).toBe(true); // the sprite is visible
    const calls: string[] = [];
    rt.pen = {
      line: (_p, x0, y0, x1, y1) => calls.push(`line ${x0},${y0} ${x1},${y1}`),
      stamp: (s) => calls.push(`stamp ${s.name}`),
      clear: () => calls.push("clear"),
    } satisfies PenLayer;
    t.visible = false;
    rt.redraw = false;
    setXY(rt, t, 20, 5);
    expect(rt.redraw).toBe(true);
    penUp(t);
    setXY(rt, t, 30, 5);
    penDown(rt, t);
    stamp(rt, t);
    expect(calls).toEqual(["line 10,0 20,5", "line 30,5 30,5", "stamp S"]);
  });

  it("gives a clone a copy of the pen, still down", () => {
    const rt = runtime();
    const t = rt.targets[1]!;
    penDown(rt, t);
    const clone = new Target(t);
    expect(clone.pen).toEqual(t.pen);
    expect(clone.pen).not.toBe(t.pen);
    expect(clone.pen!.down).toBe(true);
  });
});

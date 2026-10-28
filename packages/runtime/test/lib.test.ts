// The helpers in src/lib/ called directly, and through the one-line `Runtime` delegates that
// generated code still uses.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { Runtime } from "../src/index.js";
import { bounce, coord, glide, move, setDirection, setXY } from "../src/lib/motion.js";
import { costumeName, goToFront, nextCostume, say, setSize, setVisible, switchCostume } from "../src/lib/looks.js";
import { keyPressed } from "../src/lib/sensing.js";
import { wait } from "../src/lib/control.js";

const costume = (name: string) => ({ name, md5ext: `${name}.svg`, rotationCenterX: 0, rotationCenterY: 0 });
const sprite = (name: string, layerOrder: number) => ({
  isStage: false,
  name,
  variables: {},
  lists: {},
  costumes: [costume("a"), costume("b"), costume("c")],
  currentCostume: 0,
  layerOrder,
  x: 0,
  y: 0,
  direction: 90,
  size: 100,
  visible: true,
  rotationStyle: "all around",
});
const project = {
  targets: [
    { isStage: true, name: "Stage", variables: {}, lists: {}, costumes: [], currentCostume: 0, layerOrder: 0 },
    sprite("One", 1),
    sprite("Two", 2),
  ],
} as unknown as ProjectJson;

function make() {
  const rt = new Runtime(project, () => [], { clock: "virtual", turbo: true });
  return { rt, one: rt.targets[1]!, two: rt.targets[2]! };
}

describe("lib helpers", () => {
  it("motion", () => {
    const { rt, one } = make();
    move(rt, one, 10);
    expect(coord(one.x)).toBe(10);
    expect(coord(one.y)).toBe(0);
    setDirection(rt, one, 180 + 90);
    expect(one.direction).toBe(-90);
    setDirection(rt, one, Infinity);
    expect(one.direction).toBe(-90);
    setXY(rt, one, 500, -500);
    bounce(rt, one);
    expect([one.x, one.y]).toEqual([240, -180]);
    expect(coord(0.1 + 0.2 - 0.3)).toBe(0);
    expect(coord(0.5)).toBe(0.5);
  });

  it("glide and wait yield WAIT until the virtual clock passes", () => {
    const { rt, one } = make();
    const g = glide(rt, one, 0, 5, 6);
    expect(g.next().done).toBe(true);
    expect([one.x, one.y]).toEqual([5, 6]);
    const w = wait(rt, 0);
    expect(w.next().value).toBe(rt.WAIT);
    expect(w.next().done).toBe(true);
  });

  it("looks", () => {
    const { rt, one, two } = make();
    switchCostume(rt, one, "c");
    expect(costumeName(one)).toBe("c");
    nextCostume(rt, one);
    expect(costumeName(one)).toBe("a");
    switchCostume(rt, one, "previous costume");
    expect(costumeName(one)).toBe("c");
    switchCostume(rt, one, 2);
    expect(costumeName(one)).toBe("b");
    setSize(rt, one, 1);
    expect(one.size).toBe(5);
    setVisible(rt, one, false);
    expect(one.visible).toBe(false);
    goToFront(rt, one);
    expect(one.layer).toBe(two.layer + 1);
    say(rt, one, "think", 42);
    expect(one.bubble).toEqual({ kind: "think", text: "42" });
    expect(rt.says).toEqual([{ target: "One", kind: "think", text: "42" }]);
  });

  it("sensing", () => {
    const { rt } = make();
    expect(keyPressed(rt, "any")).toBe(false);
    rt.keyDown("a");
    expect(keyPressed(rt, "A")).toBe(true);
    expect(keyPressed(rt, "any")).toBe(true);
  });

  it("the Runtime delegates give the same results", () => {
    const { rt, one } = make();
    rt.move(one, 10);
    rt.setDirection(one, 0);
    rt.nextCostume(one);
    rt.say(one, "say", "hi");
    expect([one.x, one.direction, rt.costumeName(one), one.bubble?.text]).toEqual([10, 0, "b", "hi"]);
    expect(rt.coord(1 + 1e-12)).toBe(1);
    expect(rt.timer()).toBe(0);
  });
});

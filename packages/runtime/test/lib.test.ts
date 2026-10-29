// The helpers in src/lib/ called directly, and through the one-line `Runtime` delegates that
// generated code still uses.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { BLOCKED, Runtime, SLEEP } from "../src/index.js";
import { bounce, coord, glide, move, setDirection, setXY } from "../src/lib/motion.js";
import { costumeName, goToFront, nextCostume, say, setSize, setVisible, switchCostume } from "../src/lib/looks.js";
import { ask, keyPressed } from "../src/lib/sensing.js";
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

  // A redraw request ends the frame outside turbo mode, so these decide frame pacing. They follow
  // where TurboWarp (with its renderer) calls runtime.requestRedraw().
  describe("redraw requests, as in TurboWarp", () => {
    const redraws = (fn: (rt: Runtime, one: ReturnType<typeof make>["one"]) => void, hidden = false) => {
      const { rt, one } = make();
      if (hidden) one.visible = false;
      rt.redraw = false;
      fn(rt, one);
      return rt.redraw;
    };

    it("showing redraws, hiding does not", () => {
      expect(redraws((rt, one) => setVisible(rt, one, false))).toBe(false);
      expect(redraws((rt, one) => setVisible(rt, one, true), true)).toBe(true);
    });

    it("going to the front never redraws", () => {
      expect(redraws((rt, one) => goToFront(rt, one))).toBe(false);
    });

    it("a costume change redraws only a visible target, and always the stage", () => {
      expect(redraws((rt, one) => nextCostume(rt, one))).toBe(true);
      expect(redraws((rt, one) => nextCostume(rt, one), true)).toBe(false);
      expect(redraws((rt, one) => switchCostume(rt, one, "b"), true)).toBe(false);
      expect(redraws((rt) => switchCostume(rt, rt.stage, 1))).toBe(true);
    });

    it("a bubble redraws when it appears on a visible sprite or a drawn one goes away", () => {
      expect(redraws((rt, one) => say(rt, one, "say", "hi"))).toBe(true);
      expect(redraws((rt, one) => say(rt, one, "say", "hi"), true)).toBe(false);
      expect(redraws((rt, one) => say(rt, one, "say", ""))).toBe(false);
    });

    // TurboWarp's show and hide re-render the bubble after changing visibility.
    it("hiding removes a drawn bubble, with a redraw", () => {
      const { rt, one } = make();
      say(rt, one, "say", "hi");
      rt.redraw = false;
      setVisible(rt, one, false);
      expect([rt.redraw, one.bubbleDrawn]).toEqual([true, false]);
      rt.redraw = false;
      say(rt, one, "say", "");
      expect(rt.redraw).toBe(false);
    });

    it("showing brings back the bubble the sprite still has", () => {
      const { rt, one } = make();
      setVisible(rt, one, false);
      say(rt, one, "say", "hi");
      expect(one.bubbleDrawn).toBe(false);
      setVisible(rt, one, true);
      expect(one.bubbleDrawn).toBe(true);
      rt.redraw = false;
      say(rt, one, "say", "");
      expect(rt.redraw).toBe(true);
    });

    it("hiding without a drawn bubble does not redraw", () => {
      expect(redraws((rt, one) => setVisible(rt, one, false))).toBe(false);
      expect(redraws((rt, one) => (setVisible(rt, one, true), (rt.redraw = false), setVisible(rt, one, false)), true)).toBe(false);
    });

    it("switching to a costume that does not exist does nothing", () => {
      expect(redraws((rt, one) => switchCostume(rt, one, "no such costume"))).toBe(false);
      expect(redraws((rt, one) => switchCostume(rt, one, " "))).toBe(false);
    });
  });

  it("glide's first step only starts it, like TurboWarp", () => {
    const { rt, one } = make();
    rt.redraw = false;
    const g = glide(rt, one, 1, 100, 0);
    expect(g.next().value).toBe(rt.WAIT);
    expect([one.x, rt.redraw]).toEqual([0, false]);
    rt.frame = 15; // half a second at 30 fps
    expect(g.next().value).toBe(rt.WAIT);
    expect(one.x).toBe(50);
    // Stepped again in the same frame on the virtual clock, it would only set x = 50 again.
    expect(g.next().value).toBe(SLEEP);
    rt.frame = 30;
    expect(g.next().done).toBe(true);
    expect(one.x).toBe(100);
  });

  it("wait compares elapsed time like TurboWarp", () => {
    // At 30 fps a 1 second wait started at frame 1 ends at frame 32: (31 * 1000) / 30 - 1000 / 30
    // is just under 1000, though 31 * 1000 / 30 is not below 1000 / 30 + 1000.
    const { rt } = make();
    rt.frame = 1;
    const w = wait(rt, 1);
    expect(w.next().value).toBe(rt.WAIT);
    rt.frame = 31;
    expect(w.next().value).toBe(SLEEP);
    rt.frame = 32;
    expect(w.next().done).toBe(true);
  });

  it("sensing", () => {
    const { rt } = make();
    expect(keyPressed(rt, "any")).toBe(false);
    rt.keyDown("a");
    expect(keyPressed(rt, "A")).toBe(true);
    expect(keyPressed(rt, "any")).toBe(true);
  });

  it("ask with a queued answer stays blocked until the next frame, however often it is stepped", () => {
    const rt = new Runtime(project, () => [], { clock: "virtual", answers: ["yes"] });
    const one = rt.targets[1]!;
    const a = ask(rt, one, "name?");
    expect(a.next().value).toBe(BLOCKED);
    expect(one.bubble?.text).toBe("name?");
    expect(a.next().value).toBe(BLOCKED);
    rt.frame++;
    expect(a.next().done).toBe(true);
    expect([rt.answer, one.bubble]).toEqual(["yes", null]);
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

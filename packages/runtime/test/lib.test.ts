// The plain functions in src/lib/, which generated code calls directly.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it, vi } from "vitest";
import { BLOCKED, Runtime, SLEEP, WAIT } from "../src/index.js";
import { Target } from "../src/target.js";
import { RUNTIME_MODULES } from "../src/modules.js";
import { bounce, coord, glide, glideTo, goTo, goToRandom, move, pointAt, pointTowards, setDirection, setXY } from "../src/lib/motion.js";
import { costumeName, goToBack, goToFront, moveLayers, nextCostume, say, setSize, setVisible, switchCostume } from "../src/lib/looks.js";
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
    expect(w.next().value).toBe(WAIT);
    expect(w.next().done).toBe(true);
  });

  describe("go to, glide to and point towards", () => {
    it("go to a sprite, the mouse or a random position; an unknown name does nothing", () => {
      const { rt, one, two } = make();
      setXY(rt, two, 30, -40);
      goTo(rt, one, "Two");
      expect([one.x, one.y]).toEqual([30, -40]);
      rt.mouse.x = 7;
      rt.mouse.y = -8;
      goTo(rt, one, "_mouse_");
      expect([one.x, one.y]).toEqual([7, -8]);
      goTo(rt, one, "Nobody");
      goTo(rt, one, "Stage");
      goTo(rt, one, "_edge_");
      expect([one.x, one.y]).toEqual([7, -8]);
      goTo(rt, one, 3);
      expect([one.x, one.y]).toEqual([7, -8]);
    });

    it("a random position is rounded to the stage, x drawn before y", () => {
      const { rt, one } = make();
      const draws = [0, 1, 0.5, 0.25];
      const random = vi.spyOn(Math, "random").mockImplementation(() => draws.shift()!);
      goToRandom(rt, one);
      expect([one.x, one.y]).toEqual([-240, 180]);
      goTo(rt, one, "_random_");
      expect([one.x, one.y]).toEqual([0, -90]);
      random.mockRestore();
    });

    it("glide to takes its place when it starts, and an unknown name does not yield", () => {
      const { rt, one, two } = make();
      setXY(rt, two, 10, 20);
      const g = glideTo(rt, one, 0, "Two");
      expect(g.next().done).toBe(true);
      expect([one.x, one.y]).toEqual([10, 20]);
      setXY(rt, one, 0, 0);
      expect(glideTo(rt, one, 5, "Nobody").next().done).toBe(true);
      expect([one.x, one.y]).toEqual([0, 0]);
      expect(glideTo(rt, one, 5, "Two").next().value).toBe(WAIT);
    });

    it("point towards turns to face the place", () => {
      const { rt, one, two } = make();
      setXY(rt, two, 0, 10);
      pointTowards(rt, one, "Two");
      expect(one.direction).toBe(0);
      pointAt(rt, one, 10, 0);
      expect(one.direction).toBe(90);
      pointAt(rt, one, 0, -10);
      expect(one.direction).toBe(180);
      pointTowards(rt, one, "Nobody");
      expect(one.direction).toBe(180);
      rt.mouse.x = -5;
      rt.mouse.y = 0;
      pointTowards(rt, one, "_mouse_");
      expect(one.direction).toBe(-90);
      const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
      pointTowards(rt, one, "_random_");
      expect(one.direction).toBe(0);
      random.mockRestore();
    });
  });

  describe("layers", () => {
    // The stage, then One, Two and Three from the back to the front.
    const three = () => {
      const { rt, one, two } = make();
      const clone = new Target(one);
      rt.addClone(clone, one);
      return { rt, one, two, clone };
    };
    const order = (rt: Runtime) => [...rt.targets].sort((a, b) => a.layer - b.layer).map((t) => (t.isStage ? "S" : t.isOriginal ? t.name : `${t.name}'`));

    it("moves forward and backward by n layers and stops at the ends", () => {
      const { rt, one, two, clone } = three();
      // A clone is just behind its parent.
      expect(order(rt)).toEqual(["S", "One'", "One", "Two"]);
      moveLayers(rt, one, 1);
      expect(order(rt)).toEqual(["S", "One'", "Two", "One"]);
      moveLayers(rt, one, -2);
      expect(order(rt)).toEqual(["S", "One", "One'", "Two"]);
      moveLayers(rt, clone, 10);
      expect(order(rt)).toEqual(["S", "One", "Two", "One'"]);
      moveLayers(rt, two, -10);
      expect(order(rt)).toEqual(["S", "Two", "One", "One'"]);
      moveLayers(rt, two, Infinity);
      expect(order(rt)).toEqual(["S", "One", "One'", "Two"]);
      moveLayers(rt, two, -Infinity);
      expect(order(rt)).toEqual(["S", "Two", "One", "One'"]);
      // Going forward by a negative number goes backward, and 0 or a fraction below 1 stays.
      moveLayers(rt, one, -1);
      expect(order(rt)).toEqual(["S", "One", "Two", "One'"]);
      moveLayers(rt, one, 0);
      expect(order(rt)).toEqual(["S", "One", "Two", "One'"]);
      expect(rt.stage.layer).toBe(0);
    });

    it("go to back stays in front of the stage, go to front goes past everything", () => {
      const { rt, one, two } = three();
      goToBack(rt, two);
      expect(order(rt)).toEqual(["S", "Two", "One'", "One"]);
      goToFront(rt, two);
      expect(order(rt)).toEqual(["S", "One'", "One", "Two"]);
      goToFront(rt, one);
      expect(order(rt)).toEqual(["S", "One'", "Two", "One"]);
      // Distinct layers, renumbered by a move.
      moveLayers(rt, one, -1);
      expect(rt.targets.map((t) => t.layer).sort()).toEqual([0, 1, 2, 3]);
    });

    it("the stage never moves", () => {
      const { rt } = three();
      const before = order(rt);
      goToFront(rt, rt.stage);
      goToBack(rt, rt.stage);
      moveLayers(rt, rt.stage, 2);
      expect(order(rt)).toEqual(before);
    });

    it("never redraws", () => {
      const { rt, one, two } = three();
      rt.redraw = false;
      moveLayers(rt, one, 1);
      goToBack(rt, two);
      expect(rt.redraw).toBe(false);
    });
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
    expect(g.next().value).toBe(WAIT);
    expect([one.x, rt.redraw]).toEqual([0, false]);
    rt.frame = 15; // half a second at 30 fps
    expect(g.next().value).toBe(WAIT);
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
    expect(w.next().value).toBe(WAIT);
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

  it("are not on the Runtime: generated code calls them by name, with no method in between", () => {
    const { rt } = make();
    for (const [from, m] of Object.entries(RUNTIME_MODULES)) {
      if (from.endsWith("/ops")) continue;
      for (const name of Object.keys(m)) expect(name in rt, `${from} ${name}`).toBe(false);
    }
  });
});

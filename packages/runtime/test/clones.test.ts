// Clones: what a clone copies, where it goes in the layers, the 300 limit, which hats reach it,
// and how it is removed (delete this clone, stop all, the green flag).
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { RETIRE, Runtime, turbowarpCompat, WAIT, type Hat, type RuntimeOptions, type Target } from "../src/index.js";
import { createClone, createCloneOf, deleteClone } from "../src/lib/control.js";
import { broadcast } from "../src/lib/event.js";

function sprite(name: string, layerOrder: number) {
  return {
    isStage: false, name, variables: { v: ["v", 0] }, lists: { l: ["l", []] }, costumes: [], currentCostume: 0, layerOrder,
    x: 0, y: 0, direction: 90, size: 100, visible: true, rotationStyle: "all around", draggable: false,
  };
}

const project = {
  targets: [
    { isStage: true, name: "Stage", variables: {}, lists: {}, costumes: [], currentCostume: 0, layerOrder: 0 },
    sprite("A", 1),
    sprite("B", 2),
  ],
} as unknown as ProjectJson;

function setup(hats: (log: string[]) => Hat[] = () => [], options: RuntimeOptions = {}) {
  const log: string[] = [];
  const rt = new Runtime(project, () => hats(log), { clock: "virtual", schedulerClock: () => 0, ...options });
  return { rt, log, a: rt.targets[1]!, b: rt.targets[2]! };
}

/** Sprite names from the top layer down, a clone shown by its `v`. */
const topDown = (rt: Runtime) => [...rt.targets].sort((x, y) => y.layer - x.layer).map((t) => (t.isOriginal ? t.name : `${t.name}:${t.v.v}`));

describe("creating a clone", () => {
  it("copies variables, lists, motion and looks, deeply", () => {
    const { rt, a } = setup();
    Object.assign(a, { x: 10, y: -5, direction: 45, size: 50, visible: false, costume: 0, rotationStyle: "left-right", draggable: true });
    a.v.v = 7;
    a.l.l!.push("x");
    a.effects.ghost = 30;
    a.bubble = { kind: "say", text: "hi" };
    createClone(rt, a);
    const c = rt.targets[3]!;
    expect(c).toMatchObject({ name: "A", index: 1, isOriginal: false, x: 10, y: -5, direction: 45, size: 50, visible: false });
    expect(c).toMatchObject({ rotationStyle: "left-right", draggable: true, bubble: null });
    expect([c.v.v, c.l.l, c.effects]).toEqual([7, ["x"], { ghost: 30 }]);
    c.l.l!.push("y");
    c.v.v = 8;
    c.effects.ghost = 0;
    expect([a.v.v, a.l.l, a.effects.ghost]).toEqual([7, ["x"], 30]);
    expect(rt.cloneCount).toBe(1);
  });

  it("puts the clone just behind its parent, a clone of a clone behind that clone", () => {
    const { rt, a, b } = setup();
    a.v.v = 1;
    createClone(rt, a);
    a.v.v = 2;
    createClone(rt, a);
    b.v.v = 3;
    createClone(rt, b);
    const clone3 = rt.targets[5]!;
    clone3.v.v = 4;
    createClone(rt, clone3);
    clone3.v.v = 3;
    expect(topDown(rt)).toEqual(["B", "B:3", "B:4", "A", "A:2", "A:1", "Stage"]);
  });

  it("makes no clone of the stage, and none beyond the limit across all sprites", () => {
    const { rt, a, b } = setup(undefined, turbowarpCompat);
    createClone(rt, rt.stage);
    createCloneOf(rt, rt.stage, "_myself_");
    expect(rt.cloneCount).toBe(0);
    for (let i = 0; i < 200; i++) createClone(rt, a);
    for (let i = 0; i < 200; i++) createClone(rt, b);
    expect([rt.cloneCount, rt.targets.length]).toEqual([300, 303]);
    deleteClone(rt, rt.targets[3]!);
    createClone(rt, b);
    expect(rt.cloneCount).toBe(300);
  });

  it("has no clone limit by default", () => {
    const { rt, a, b } = setup();
    expect(rt.options.cloneLimit).toBe(Infinity);
    for (let i = 0; i < 200; i++) createClone(rt, a);
    for (let i = 0; i < 200; i++) createClone(rt, b);
    expect([rt.cloneCount, rt.targets.length]).toEqual([400, 403]);
  });

  it("clones a sprite by name, its original even when the caller is a clone", () => {
    const { rt, a } = setup();
    createCloneOf(rt, a, "_myself_");
    const clone = rt.targets[3]!;
    clone.x = 50;
    createCloneOf(rt, clone, "A");
    createCloneOf(rt, clone, "Stage");
    createCloneOf(rt, clone, "nobody");
    expect(rt.targets.map((t) => t.x)).toEqual([0, 0, 0, 50, 0]);
  });
});

describe("hats and clones", () => {
  const hats = (log: string[]): Hat[] => [
    { target: 1, kind: "clone", restart: false, fn: function* (t) { log.push(`cloned ${t.v.v}`); } },
    { target: 1, kind: "flag", fn: function* (t) { log.push(`flag ${t.v.v}`); } },
    {
      target: 1, kind: "broadcast", arg: "go",
      fn: function* (t) {
        log.push(`go ${t.v.v}`);
        yield WAIT;
        log.push(`went ${t.v.v}`);
      },
    },
  ];

  it("starts 'when I start as a clone' for the new clone only", () => {
    const { rt, log, a } = setup(hats);
    a.v.v = 1;
    createClone(rt, a);
    rt.tick();
    a.v.v = 2;
    createClone(rt, a);
    rt.tick();
    expect(log).toEqual(["cloned 1", "cloned 2"]);
  });

  it("sends broadcasts to clones from the top layer down, restarting each target's own run", () => {
    const { rt, log, a } = setup(hats);
    a.v.v = 1;
    createClone(rt, a);
    const first = rt.targets[3]!;
    first.v.v = 2;
    createClone(rt, first);
    first.v.v = 1;
    a.v.v = 0;
    rt.tick();
    log.length = 0;
    broadcast(rt, "go");
    rt.tick();
    expect(log).toEqual(["go 0", "go 1", "go 2", "went 0", "went 1", "went 2"]);
    // Again, while a run waits in one clone: only that target's run restarts.
    log.length = 0;
    const started = broadcast(rt, "go");
    expect(started.map((th) => th.target.v.v)).toEqual([0, 1, 2]);
    expect(rt.threads.filter((th) => !th.done)).toHaveLength(3);
  });

  it("removes every clone on the green flag, so only the originals hear it", () => {
    const { rt, log, a } = setup(hats);
    createClone(rt, a);
    createClone(rt, a);
    rt.greenFlag();
    rt.tick();
    expect(log).toEqual(["flag 0"]);
    expect([rt.cloneCount, rt.targets.length]).toEqual([0, 3]);
  });

  it("stop all removes the clones and requests a redraw for a visible one", () => {
    const { rt, a } = setup();
    createClone(rt, a);
    rt.redraw = false;
    rt.stopAll();
    expect([rt.cloneCount, rt.targets.length, rt.redraw]).toEqual([0, 3, true]);
  });
});

describe("deleting a clone", () => {
  it("stops all its scripts and removes it, and does nothing to an original", () => {
    const log: string[] = [];
    const { rt, a } = setup(() => [
      {
        target: 1, kind: "broadcast", arg: "go",
        fn: function* (t: Target) {
          log.push(`go ${t.v.v}`);
          yield WAIT;
          if (deleteClone(rt, t)) return;
          log.push(`kept ${t.v.v}`);
        },
      },
      { target: 1, kind: "broadcast", arg: "go", fn: function* (t: Target) { for (;;) { log.push(`loop ${t.v.v}`); yield WAIT; } } },
    ]);
    a.v.v = "a";
    createClone(rt, a);
    rt.targets[3]!.v.v = "c";
    broadcast(rt, "go");
    rt.tick();
    expect(rt.targets.map((t) => t.name)).toEqual(["Stage", "A", "B"]);
    expect(rt.cloneCount).toBe(0);
    // The clone's loop got one step before its other script deleted the clone.
    expect(log.filter((l) => l.endsWith(" c"))).toEqual(["go c", "loop c"]);
    expect(log).toContain("kept a");
    expect(rt.threads.filter((th) => !th.done).map((th) => th.target.v.v)).toEqual(["a"]);
  });

  it("ends a thread that throws RETIRE from a custom block", () => {
    const log: string[] = [];
    const { rt, a } = setup(() => [
      {
        target: 1, kind: "clone", restart: false,
        fn: function* (t: Target) {
          (function vanish() {
            if (deleteClone(rt, t)) throw RETIRE;
          })();
          log.push("after");
        },
      },
    ]);
    createClone(rt, a);
    rt.tick();
    expect([log, rt.cloneCount, rt.running]).toEqual([[], 0, false]);
  });
});

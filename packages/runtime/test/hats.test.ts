// Starting hats: TurboWarp's restartExistingThreads rule (Hat.restart) and the order of key hats.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { Runtime, BLOCKED, type Hat, type ScriptFn } from "../src/index.js";

const project = {
  targets: [{ isStage: true, name: "Stage", variables: {}, lists: {}, costumes: [], currentCostume: 0, layerOrder: 0 }],
} as unknown as ProjectJson;

/**
 * A script that logs when it starts, waits `frames` frames, and logs when it ends. Each `BLOCKED`
 * takes a frame here, since a pass in which no thread can go on ends the frame.
 */
function waiting(log: string[], name: string, frames: number): ScriptFn {
  return function* () {
    log.push(`${name} start`);
    for (let i = 0; i < frames; i++) yield BLOCKED;
    log.push(`${name} end`);
  };
}

function setup(hats: (log: string[]) => Omit<Hat, "target">[]) {
  const log: string[] = [];
  const rt = new Runtime(project, () => hats(log).map((h) => ({ target: 0, ...h })), { clock: "virtual", schedulerClock: () => 0 });
  return { rt, log };
}

describe("hat restarts", () => {
  it("leaves a running key script alone when its key is pressed again", () => {
    const { rt, log } = setup((log) => [{ kind: "key", arg: "space", restart: false, fn: waiting(log, "space", 3) }]);
    rt.keyDown("space");
    rt.tick();
    rt.keyDown("space");
    rt.tick();
    rt.keyDown("space");
    for (let i = 0; i < 5; i++) rt.tick();
    expect(log).toEqual(["space start", "space end"]);
    expect(rt.running).toBe(false);
  });

  it("starts a key script again once it has finished", () => {
    const { rt, log } = setup((log) => [{ kind: "key", arg: "space", restart: false, fn: waiting(log, "space", 1) }]);
    rt.keyDown("space");
    for (let i = 0; i < 3; i++) rt.tick();
    rt.keyDown("space");
    for (let i = 0; i < 3; i++) rt.tick();
    expect(log).toEqual(["space start", "space end", "space start", "space end"]);
  });

  it("restarts a running broadcast script", () => {
    const { rt, log } = setup((log) => [{ kind: "broadcast", arg: "go", fn: waiting(log, "go", 3) }]);
    rt.broadcast("go");
    rt.tick();
    rt.broadcast("go");
    for (let i = 0; i < 5; i++) rt.tick();
    expect(log).toEqual(["go start", "go start", "go end"]);
  });
});

describe("key hats", () => {
  it("start the scripts for the key before the any-key scripts, like TurboWarp", () => {
    const { rt, log } = setup((log) => [
      { kind: "key", arg: "any", restart: false, fn: waiting(log, "any", 0) },
      { kind: "key", arg: "space", restart: false, fn: waiting(log, "space", 0) },
    ]);
    rt.keyDown("space");
    rt.tick();
    expect(log).toEqual(["space start", "space end", "any start", "any end"]);
  });

  it("start only the any-key scripts for a key no script names", () => {
    const { rt, log } = setup((log) => [
      { kind: "key", arg: "any", restart: false, fn: waiting(log, "any", 0) },
      { kind: "key", arg: "space", restart: false, fn: waiting(log, "space", 0) },
    ]);
    rt.keyDown("x");
    rt.tick();
    expect(log).toEqual(["any start", "any end"]);
  });
});

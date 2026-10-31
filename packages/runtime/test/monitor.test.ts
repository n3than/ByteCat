// List monitors: what `show list` and `hide list` do to the runtime's monitor table.
import type { ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { Runtime, monitorItems } from "../src/index.js";
import { showList } from "../src/ops.js";

const target = (name: string, isStage: boolean, lists: Record<string, [string, unknown[]]>) => ({
  isStage, name, variables: {}, lists, costumes: [], currentCostume: 0, layerOrder: isStage ? 0 : 1,
  x: 0, y: 0, direction: 90, size: 100, visible: true, rotationStyle: "all around",
});

function make(monitors: unknown[] = []) {
  const project = {
    targets: [
      target("Stage", true, { g: ["glob", [1, 2]], h: ["other", []] }),
      target("Cat", false, { c: ["mine", ["a"]] }),
    ],
    monitors,
  } as unknown as ProjectJson;
  const rt = new Runtime(project, () => [], { clock: "virtual", turbo: true });
  return { rt, cat: rt.targets[1]! };
}

describe("list monitors", () => {
  it("start hidden, and show list creates one at the first free spot", () => {
    const { rt, cat } = make();
    expect(rt.listMonitors.size).toBe(0);
    showList(rt, cat, "g", true);
    showList(rt, cat, "c", true);
    const [g, c] = [rt.listMonitors.get("g")!, rt.listMonitors.get("c")!];
    expect(g).toMatchObject({ name: "glob", sprite: null, visible: true, x: 5, y: 5, width: 100, height: 200 });
    expect(c).toMatchObject({ name: "mine", sprite: "Cat", visible: true, x: 110, y: 5 });
    expect(monitorItems(rt, g)).toEqual([1, 2]);
    expect(monitorItems(rt, c)).toEqual(["a"]);
  });

  it("hide list hides it and frees its spot", () => {
    const { rt, cat } = make();
    showList(rt, cat, "g", true);
    showList(rt, cat, "g", false);
    expect(rt.listMonitors.get("g")!.visible).toBe(false);
    showList(rt, cat, "c", true);
    expect(rt.listMonitors.get("c")).toMatchObject({ x: 5, y: 5 });
  });

  it("shows the live list, and requests a redraw only when something changes", () => {
    const { rt, cat } = make();
    showList(rt, cat, "g", true);
    expect(rt.redraw).toBe(true);
    rt.redraw = false;
    showList(rt, cat, "g", true);
    expect(rt.redraw).toBe(false);
    rt.stage.l.g!.push(3);
    expect(monitorItems(rt, rt.listMonitors.get("g")!)).toEqual([1, 2, 3]);
  });

  it("ignores a list that does not exist", () => {
    const { rt, cat } = make();
    showList(rt, cat, "nope", true);
    expect(rt.listMonitors.size).toBe(0);
  });

  it("reads the monitors of project.json: position, size and visibility", () => {
    const { rt } = make([
      { id: "g", mode: "list", opcode: "data_listcontents", params: { LIST: "glob" }, spriteName: null, width: 150, height: 80, x: 20, y: 30, visible: true },
      { id: "h", mode: "list", opcode: "data_listcontents", params: { LIST: "other" }, spriteName: null, width: 0, height: 0, x: 0, y: 0, visible: true },
      { id: "v", mode: "default", opcode: "data_variable", params: { VARIABLE: "v" }, spriteName: null, visible: true },
    ]);
    expect([...rt.listMonitors.keys()]).toEqual(["g", "h"]);
    expect(rt.listMonitors.get("g")).toMatchObject({ x: 20, y: 30, width: 150, height: 80, visible: true });
    // No size: the default one, in a free spot next to the placed monitor (20..170 wide).
    expect(rt.listMonitors.get("h")).toMatchObject({ width: 100, height: 200, x: 175, y: 5 });
  });
});

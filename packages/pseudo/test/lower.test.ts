import type { Block, ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { compile, PseudoError } from "../src/index.js";

function project(source: string): ProjectJson {
  return compile(source).project.json;
}

function blocksOf(json: ProjectJson, target = 1): Block[] {
  return Object.values(json.targets[target]!.blocks);
}

function opcodes(source: string): string[] {
  return blocksOf(project(source)).map((b) => b.opcode);
}

function errorOf(source: string): string {
  try {
    compile(source);
  } catch (e) {
    if (e instanceof PseudoError) return e.message;
    throw e;
  }
  throw new Error("expected a compile error");
}

describe("lowering", () => {
  it("puts globals on the stage and locals on the sprite", () => {
    const json = project(`var g = 1\nsprite A:\n  var l = "x"\n  when flag:\n    g = l\n`);
    expect(Object.values(json.targets[0].variables)).toEqual([["g", 1]]);
    expect(Object.values(json.targets[1]!.variables)).toEqual([["l", "x"]]);
  });

  it("chains statements with next and parent links", () => {
    const json = project(`sprite A:\n  when flag:\n    move(1)\n    move(2)\n`);
    const blocks = json.targets[1]!.blocks;
    const hat = Object.entries(blocks).find(([, b]) => b.topLevel)!;
    const first = blocks[hat[1].next!]!;
    const second = blocks[first.next!]!;
    expect(first.parent).toBe(hat[0]);
    expect(second.parent).toBe(hat[1].next);
    expect(second.inputs.STEPS).toEqual([1, [4, "2"]]);
  });

  it("puts variables into inputs as compact primitives over a shadow", () => {
    const json = project(`var x = 0\nsprite A:\n  when flag:\n    move(x)\n`);
    const move = blocksOf(json).find((b) => b.opcode === "motion_movesteps")!;
    const id = Object.keys(json.targets[0].variables)[0]!;
    expect(move.inputs.STEPS).toEqual([3, [12, "x", id], [4, "10"]]);
  });

  it("desugars != <= >= into not", () => {
    expect(opcodes(`sprite A:\n  when flag:\n    wait_until(1 >= 2)\n`)).toEqual([
      "event_whenflagclicked", "control_wait_until", "operator_not", "operator_lt",
    ]);
  });

  it("desugars for loops into set, repeat until and change", () => {
    expect(opcodes(`var i = 0\nsprite A:\n  when flag:\n    for i = 1 to 3:\n      move(i)\n`)).toEqual([
      "event_whenflagclicked", "data_setvariableto", "control_repeat_until", "operator_gt",
      "motion_movesteps", "data_changevariableby",
    ]);
  });

  it("builds procedure definitions, prototypes and calls that agree on argument ids", () => {
    const json = project(`sprite A:\n  define go(n, fast: bool):\n    move(n)\n  when flag:\n    go(5, 1 < 2)\n`);
    const blocks = blocksOf(json);
    const proto = blocks.find((b) => b.opcode === "procedures_prototype")!;
    const call = blocks.find((b) => b.opcode === "procedures_call")!;
    expect(proto.mutation!.proccode).toBe("go %s %b");
    expect(call.mutation!.argumentids).toBe(proto.mutation!.argumentids);
    const [n, fast] = JSON.parse(proto.mutation!.argumentids!) as string[];
    expect(call.inputs[n!]).toEqual([1, [10, "5"]]);
    expect(call.inputs[fast!]![0]).toBe(2);
  });

  it("lowers custom reporters: a prototype and calls marked as returning, the return block, and calls in inputs", () => {
    const json = project(
      `sprite A:\n  define warp twice(n) -> value:\n    return n * 2\n  define big(n) -> bool:\n    return n > 9\n` +
        `  when flag:\n    if big(twice(5)):\n      log(twice(1))\n    return 0\n`,
    );
    const blocks = blocksOf(json);
    const proto = blocks.find((b) => b.opcode === "procedures_prototype" && b.mutation!.proccode === "twice %s")!;
    expect(proto.mutation).toMatchObject({ warp: "true", return: "1" });
    const calls = blocks.filter((b) => b.opcode === "procedures_call");
    expect(calls.map((b) => [b.mutation!.proccode, b.mutation!.return])).toEqual([
      ["big %s", "1"],
      ["twice %s", "1"],
      ["twice %s", "1"],
    ]);
    // `big(...)` sits in the if's condition, and `twice(5)` in big's argument.
    const ifBlock = blocks.find((b) => b.opcode === "control_if")!;
    expect(json.targets[1]!.blocks[(ifBlock.inputs.CONDITION as [2, string])[1]]!.opcode).toBe("procedures_call");
    const returns = blocks.filter((b) => b.opcode === "procedures_return");
    expect(returns).toHaveLength(3);
    expect(returns[2]!.inputs.VALUE).toEqual([1, [10, "0"]]);
  });

  it("rejects a custom reporter used as a statement and a command block used as a value", () => {
    const defs = `sprite A:\n  define f() -> value:\n    return 1\n  define g():\n    move(1)\n  when flag:\n`;
    expect(errorOf(`${defs}    f()\n`)).toMatch(/f\(\) reports a value and cannot be used as a statement/);
    expect(errorOf(`${defs}    log(g())\n`)).toMatch(/returns nothing. Define it with '-> value'/);
    expect(errorOf(`${defs}    if f():\n      move(1)\n`)).toMatch(/expected a condition/);
    expect(errorOf(`sprite A:\n  define f() -> number:\n    return 1\n`)).toMatch(/unknown return type 'number'/);
    expect(errorOf(`sprite A:\n  when flag:\n    return = 1\n`)).toMatch(/expected an expression|reserved/);
  });

  it("fills the touching menu shadow with the target name", () => {
    const json = project(`sprite A:\n  when flag:\n    if touching("_edge_"):\n      move(1)\n`);
    const blocks = blocksOf(json);
    const touching = blocks.find((b) => b.opcode === "sensing_touchingobject")!;
    const menuId = (touching.inputs.TOUCHINGOBJECTMENU as [number, string])[1];
    const menu = json.targets[1]!.blocks[menuId]!;
    expect(menu.opcode).toBe("sensing_touchingobjectmenu");
    expect(menu.shadow).toBe(true);
    expect(menu.fields.TOUCHINGOBJECTMENU).toEqual(["_edge_", null]);
  });

  it("lowers the clone hat and blocks, with the clone menu shadow", () => {
    const json = project(`sprite A:\n  when cloned:\n    create_clone("_myself_")\n    delete_clone()\n`);
    expect(blocksOf(json).map((b) => b.opcode)).toEqual([
      "control_start_as_clone", "control_create_clone_of", "control_create_clone_of_menu", "control_delete_this_clone",
    ]);
    const create = blocksOf(json).find((b) => b.opcode === "control_create_clone_of")!;
    const menu = json.targets[1]!.blocks[(create.inputs.CLONE_OPTION as [number, string])[1]]!;
    expect([menu.shadow, menu.fields.CLONE_OPTION]).toEqual([true, ["_myself_", null]]);
    expect(errorOf(`stage:\n  when cloned:\n    log(1)\n`)).toMatch(/only available in sprites/);
    expect(errorOf(`stage:\n  when flag:\n    delete_clone()\n`)).toMatch(/only available in sprites/);
  });

  it("registers broadcasts on the stage", () => {
    const json = project(`sprite A:\n  when receive "go":\n    broadcast("stop")\n`);
    expect(Object.values(json.targets[0].broadcasts).sort()).toEqual(["go", "stop"]);
  });

  it("creates the log list on demand", () => {
    const json = project(`sprite A:\n  when flag:\n    log(1)\n`);
    expect(Object.values(json.targets[0].lists)).toEqual([["log", []]]);
  });

  it("is deterministic", () => {
    const src = `var x = 1\nsprite A:\n  when flag:\n    x += 1\n`;
    expect(JSON.stringify(project(src))).toBe(JSON.stringify(project(src)));
  });

  it("explains unknown names", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    log(score)\n`)).toMatch(/unknown name 'score'.*var score = 0/);
  });

  it("suggests close builtin names", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    mvoe(10)\n`)).toMatch(/Did you mean 'move'/);
  });

  it("rejects non-boolean conditions", () => {
    expect(errorOf(`var x = 0\nsprite A:\n  when flag:\n    if x:\n      move(1)\n`)).toMatch(/expected a condition/);
  });

  it("rejects sprite-only blocks on the stage", () => {
    expect(errorOf(`stage:\n  when flag:\n    move(1)\n`)).toMatch(/only available in sprites/);
  });

  it("lowers the hidden counter blocks and all_at_once", () => {
    const json = project(
      `sprite A:\n  when flag:\n    clear_counter()\n    all_at_once:\n      incr_counter()\n      log(counter())\n`,
    );
    const blocks = json.targets[1]!.blocks;
    expect(Object.values(blocks).map((b) => b.opcode).sort()).toEqual([
      "control_all_at_once", "control_clear_counter", "control_get_counter", "control_incr_counter",
      "data_addtolist", "event_whenflagclicked",
    ]);
    const [id, all] = Object.entries(blocks).find(([, b]) => b.opcode === "control_all_at_once")!;
    expect(blocks[all.inputs.SUBSTACK![1] as string]!.opcode).toBe("control_incr_counter");
    expect(blocks[all.inputs.SUBSTACK![1] as string]!.parent).toBe(id);
  });

  it("only treats all_at_once as a block when a colon follows", () => {
    // Still an ordinary name elsewhere.
    expect(opcodes(`var all_at_once = 1\nsprite A:\n  when flag:\n    all_at_once = 2\n`)).toEqual([
      "event_whenflagclicked", "data_setvariableto",
    ]);
  });

  it("rejects counter() as a statement and incr_counter() as a value", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    counter()\n`)).toMatch(/reporter and cannot be used as a statement/);
    expect(errorOf(`sprite A:\n  when flag:\n    log(incr_counter())\n`)).toMatch(/statement and cannot be used as a value/);
  });

  it("rejects unknown costumes", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    switch_costume("nope")\n`)).toMatch(/unknown costume/);
  });

  it("rejects wrong argument counts", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    goto(1)\n`)).toMatch(/takes 2 argument/);
  });
});

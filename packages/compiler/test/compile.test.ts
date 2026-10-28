import type { Block } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { compileProject } from "../src/index.js";
import { block, project, target } from "./helpers.js";

function script(...ops: [string, Partial<Block>?][]): Record<string, Block> {
  const blocks: Record<string, Block> = { hat: block("event_whenflagclicked", { topLevel: true, next: "b0" }) };
  ops.forEach(([op, extra], i) => {
    blocks[`b${i}`] = block(op, { next: i + 1 < ops.length ? `b${i + 1}` : null, ...extra });
  });
  return blocks;
}

describe("compileProject", () => {
  it("emits a hat per script", () => {
    const { code, warnings } = compileProject(project(target(script(["motion_ifonedgebounce"]))));
    expect(warnings).toEqual([]);
    expect(code).toContain('kind: "flag"');
    expect(code).toContain("rt.bounce(t);");
  });

  it("reports unsupported statements and reporters once, sorted", () => {
    const blocks = script(["sound_play"], ["sound_play"], ["looks_gotofrontback", { fields: { FRONT_BACK: ["back"] } }]);
    const { code, warnings } = compileProject(project(target(blocks)));
    expect(warnings).toEqual(["looks_gotofrontback", "sound_play"]);
    expect(code).toContain("/* unsupported: sound_play */");
  });

  it("ignores opcodes that name Object.prototype members", () => {
    const { warnings } = compileProject(project(target(script(["constructor"]))));
    expect(warnings).toEqual(["constructor"]);
  });

  it("tells the runtime which hats do not restart a running script", () => {
    const blocks = {
      key: block("event_whenkeypressed", { topLevel: true, fields: { KEY_OPTION: ["Space", null] } }),
      flag: block("event_whenflagclicked", { topLevel: true }),
    };
    const { code } = compileProject(project(target(blocks)));
    expect(code).toContain('{ target: 1, kind: "key", arg: "space", restart: false, fn: function* (t, th) {');
    expect(code).toContain('{ target: 1, kind: "flag", fn: function* (t, th) {');
  });

  it("warns about hats it cannot start", () => {
    const blocks = { hat: block("event_whenbackdropswitchesto", { topLevel: true }) };
    expect(compileProject(project(target(blocks))).warnings).toEqual(["event_whenbackdropswitchesto"]);
  });

  it("passes numeric literals as numbers, but keeps a literal that names a costume as text", () => {
    const set = (value: string): [string, Partial<Block>] => [
      "data_setvariableto",
      { inputs: { VALUE: [1, [10, value]] }, fields: { VARIABLE: ["v", "var_0"] } },
    ];
    const blocks = script(set("1"), set("1.0"), set("2"), [
      "looks_switchcostumeto",
      { inputs: { COSTUME: [1, [10, "1"]] } },
    ]);
    const sprite = target(blocks, { variables: { var_0: ["v", 0] }, costumes: [{ name: "2" }] as never });
    const { code } = compileProject(project(sprite));
    expect(code).toContain('t.v["var_0"] = 1;');
    expect(code).toContain('t.v["var_0"] = "1.0";');
    expect(code).toContain('t.v["var_0"] = "2";');
    expect(code).toContain('rt.switchCostume(t, "1");');
  });

  it("is deterministic", () => {
    const p = project(target(script(["motion_ifonedgebounce"])));
    expect(compileProject(p).code).toBe(compileProject(p).code);
  });
});

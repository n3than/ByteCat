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

  it("warns about hats it cannot start", () => {
    const blocks = { hat: block("event_whenbackdropswitchesto", { topLevel: true }) };
    expect(compileProject(project(target(blocks))).warnings).toEqual(["event_whenbackdropswitchesto"]);
  });

  it("is deterministic", () => {
    const p = project(target(script(["motion_ifonedgebounce"])));
    expect(compileProject(p).code).toBe(compileProject(p).code);
  });
});

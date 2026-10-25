// The TurboWarp engine's "compiled every script" check must be able to fail: a project TurboWarp
// cannot compile reports compileErrors, and a normal project reports compiled threads.
import { compile } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import { writeSb3 } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";

const source = `sprite Cat:\n  when flag:\n    log("start")\n    log("end")\n`;

describe("turbowarp engine", () => {
  it("runs scripts as compiled code", async () => {
    const result = await runProject(writeSb3(compile(source).project), { engine: "turbowarp" });
    expect(result.log).toEqual(["start", "end"]);
    expect(result.compileErrors).toEqual([]);
    expect(result.compiledThreads).toBeGreaterThan(0);
  });

  it("reports scripts it cannot compile", async () => {
    const { project } = compile(source);
    // An opcode TurboWarp's compiler does not know makes it fall back to the interpreter.
    const block = project.json.targets.flatMap((t) => Object.values(t.blocks)).find((b) => b.opcode === "data_addtolist");
    expect(block).toBeDefined();
    block!.opcode = "data_unknownblock"; // a core category, so no extension is loaded
    const result = await runProject(writeSb3(project), { engine: "turbowarp" });
    expect(result.compileErrors).toHaveLength(1);
    expect(result.compiledThreads).toBe(0);
  });

  it("reports nothing for scratch-vm", async () => {
    const result = await runProject(writeSb3(compile(source).project));
    expect(result.compileErrors).toEqual([]);
    expect(result.compiledThreads).toBe(0);
  });
});

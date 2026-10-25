// End-to-end check for every example: pseudocode -> .sb3 -> schema validation -> run in scratch-vm.
// An example passes when its log() output matches examples/<name>.expected line by line.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileToSb3 } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import parseSb3 from "scratch-parser";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();

function validate(sb3: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) =>
    parseSb3(Buffer.from(sb3), false, (err) => (err ? reject(new Error(JSON.stringify(err))) : resolve())),
  );
}

describe("examples", () => {
  it("has examples", () => expect(examples.length).toBeGreaterThan(0));

  for (const file of examples) {
    const name = file.replace(/\.sbp$/, "");
    const expectedPath = join(dir, `${name}.expected`);

    it(name, async () => {
      expect(existsSync(expectedPath), `missing examples/${name}.expected`).toBe(true);
      const sb3 = compileToSb3(readFileSync(join(dir, file), "utf8"), file);
      await validate(sb3);
      const result = await runProject(sb3, { timeoutMs: 5000 });
      expect(result.finished, "project did not finish within 5 s").toBe(true);
      const expected = readFileSync(expectedPath, "utf8").split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
      expect(result.log).toEqual(expected);
    });
  }
});

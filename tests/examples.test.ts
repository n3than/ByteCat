// End-to-end check for every example: pseudocode -> .sb3 -> schema validation -> run in scratch-vm
// and in TurboWarp (compiler on). An example passes when each engine's log() output matches
// examples/<name>.expected line by line, and TurboWarp compiled every script.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileToSb3 } from "@bytecat/pseudo";
import { engines, runProject } from "@bytecat/reference";
import parseSb3 from "scratch-parser";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();

function validate(sb3: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) =>
    parseSb3(Buffer.from(sb3), false, (err) => (err ? reject(new Error(JSON.stringify(err))) : resolve())),
  );
}

describe.each(engines)("examples in %s", (engine) => {
  it("has examples", () => expect(examples.length).toBeGreaterThan(0));

  for (const file of examples) {
    const name = file.replace(/\.sbp$/, "");
    const expectedPath = join(dir, `${name}.expected`);

    // Examples with scripted input would wait forever here; tests/browser.test.ts drives them.
    const test = existsSync(join(dir, `${name}.input`)) ? it.skip : it;

    test(name, async () => {
      expect(existsSync(expectedPath), `missing examples/${name}.expected`).toBe(true);
      const sb3 = compileToSb3(readFileSync(join(dir, file), "utf8"), file);
      await validate(sb3);
      const result = await runProject(sb3, { timeoutMs: 5000, engine });
      expect(result.finished, "project did not finish within 5 s").toBe(true);
      expect(result.compileErrors, "TurboWarp fell back to its interpreter").toEqual([]);
      if (engine === "turbowarp") expect(result.compiledThreads, "TurboWarp compiled nothing").toBeGreaterThan(0);
      const expected = readFileSync(expectedPath, "utf8").split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
      expect(result.log).toEqual(expected);
    });
  }
});

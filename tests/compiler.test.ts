// Every example through the Bytecat pipeline (pseudocode -> project.json -> JS -> runtime),
// checked against examples/<name>.expected and against TurboWarp, and against scratch-vm unless
// the example has an examples/<name>.scratch.expected (a known deviation, docs/deviations.md).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@bytecat/compiler";
import { compile as compilePseudo, compileToSb3 } from "@bytecat/pseudo";
import { engines, runProject } from "@bytecat/reference";
import { Runtime } from "@bytecat/runtime";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();

describe("compiler and runtime", () => {
  for (const file of examples) {
    const name = file.replace(/\.sbp$/, "");

    // Examples with scripted input would wait forever here; tests/browser.test.ts drives them.
    const test = existsSync(join(dir, `${name}.input`)) ? it.skip : it;

    test(name, async () => {
      const source = readFileSync(join(dir, file), "utf8");
      const json = compilePseudo(source, file).project.json;
      const { program, warnings } = compile(json);
      expect(warnings).toEqual([]);
      const rt = new Runtime(json, program, { clock: "virtual", turbo: true });
      const { finished } = rt.runUntilDone(5000);
      expect(finished, "project did not finish within 5 s").toBe(true);

      const expected = readFileSync(join(dir, `${name}.expected`), "utf8")
        .split("\n")
        .filter((l, i, a) => i < a.length - 1 || l !== "");
      expect(rt.log()).toEqual(expected);

      const sb3 = compileToSb3(source, file);
      const scratchDiffers = existsSync(join(dir, `${name}.scratch.expected`));
      for (const engine of engines.filter((e) => !(e === "scratch" && scratchDiffers))) {
        const reference = await runProject(sb3, { timeoutMs: 5000, engine });
        expect(rt.log(), `differs from ${engine}`).toEqual(reference.log);
      }
    });
  }
});

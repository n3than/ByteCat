// Every example through the Bytecat pipeline (pseudocode -> project.json -> JS -> runtime),
// checked against examples/<name>.expected with Bytecat's own defaults. Run again with
// EXACT_COMPAT (TurboWarp's limits), its log must equal TurboWarp's, and scratch-vm's unless the
// example has an examples/<name>.scratch.expected or .scratch.skip (a known deviation,
// docs/deviations.md), and examples/<name>.turbowarp.expected where there is one.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@bytecat/compiler";
import { compile as compilePseudo, compileToSb3 } from "@bytecat/pseudo";
import { engines, runProject } from "@bytecat/reference";
import { Runtime, TURBOWARP } from "@bytecat/runtime";
import { EXACT_COMPAT } from "@bytecat/trace";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "examples");
const examples = readdirSync(dir).filter((f) => f.endsWith(".sbp")).sort();

const lines = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l, i, a) => i < a.length - 1 || l !== "");

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
      expect(rt.log()).toEqual(lines(join(dir, `${name}.expected`)));

      const exact = new Runtime(json, program, { ...EXACT_COMPAT, clock: "virtual", turbo: true });
      expect(exact.runUntilDone(5000).finished, "project did not finish within 5 s with EXACT_COMPAT").toBe(true);
      const turbowarpPath = join(dir, `${name}.turbowarp.expected`);
      if (existsSync(turbowarpPath)) expect(exact.log(), "differs from its .turbowarp.expected").toEqual(lines(turbowarpPath));
      const sb3 = compileToSb3(source, file);
      const scratchDiffers = existsSync(join(dir, `${name}.scratch.expected`)) || existsSync(join(dir, `${name}.scratch.skip`));
      for (const engine of engines.filter((e) => !(e === "scratch" && scratchDiffers))) {
        const reference = await runProject(sb3, { timeoutMs: 5000, engine });
        expect(exact.log(), `differs from ${engine}`).toEqual(reference.log);
      }
    });
  }
});

describe("clone limit", () => {
  // examples/clones_limit asks for 802 clones in all, more than 300 of them alive at once.
  const json = compilePseudo(readFileSync(join(dir, "clones_limit.sbp"), "utf8"), "clones_limit.sbp").project.json;
  const run = (options: object) => {
    const rt = new Runtime(json, compile(json).program, { clock: "virtual", turbo: true, ...options });
    expect(rt.runUntilDone(5000).finished).toBe(true);
    return rt.log();
  };

  it("has none by default", () => {
    expect(run({})).toContain("alive after spawning: 402");
  });

  it("is 300 with the TURBOWARP preset (--compat turbowarp)", () => {
    expect(run(TURBOWARP)).toContain("alive after spawning: 300");
    const cli = (...args: string[]) =>
      execFileSync("pnpm", ["exec", "tsx", "packages/cli/src/main.ts", "run", "examples/clones_limit.sbp", ...args], { cwd: join(dir, ".."), stdio: "pipe" }).toString();
    expect(cli("--compat", "turbowarp")).toContain("alive after spawning: 300");
    expect(cli()).toContain("alive after spawning: 402");
  }, 60_000);
});

#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { compile as compileToJs, compileProject, toModule, type CompileResult } from "@bytecat/compiler";
import { benchmark, engineNames, formatTable, getEngine, pickBaseline, type BenchResult } from "@bytecat/bench";
import { bundleHtml } from "@bytecat/player/bundle";
import { compile, PseudoError } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import { Runtime } from "@bytecat/runtime";
import { describeTrace, parseInput, traceProject } from "@bytecat/trace";
import { buildWebApp } from "@bytecat/web";
import { costumeSizes, readSb3, writeSb3, type Project, type ProjectJson } from "@bytecat/sb3";

const USAGE = `Usage: bytecat <command> [options]

Commands:
  build <file.sbp|dir> [-o out]   Compile pseudocode to .sb3 (a directory builds every .sbp in it)
        [--map]                   Also write <name>.map.json mapping block ids to source lines
  check <file.sbp...>             Parse and compile without writing anything
  dump <file.sbp|file.sb3>        Print project.json
  compile <file.sbp|file.sb3>     Compile to JavaScript (an ES module); prints to stdout unless -o is given
        [-o out.js]
  bundle <file.sbp|file.sb3|dir>  Write a standalone HTML player (default out/NAME.html; a directory bundles every .sbp)
        [-o out.html|outdir]
  web [-o out/web/index.html]     Build the web app: one HTML page that opens .sb3 files or pseudocode,
                                  compiles them in the browser and plays them
  run <file.sbp|file.sb3>         Run and print log() output and say bubbles
        [--engine bytecat|reference|turbowarp]  bytecat (default) is the compiled runtime,
                                  reference is scratch-vm, turbowarp is TurboWarp's VM with its compiler
        [--timeout ms] [--json] [--answer text]...
  bench [names...]                Time bench/NAME.sbp (default: every bench/*.sbp) on each engine and check its output
        [--engines bytecat,scratch-vm,turbowarp] [--runs 5] [--warmup 1]   (default: every engine)
        [--runs-bytecat N] [--warmup-bytecat N]   Override --runs and --warmup for the Bytecat engine only: its runs
                                      take a few ms, so a steady median needs many more of them
        [--baseline turbowarp]        Engine the speedup columns compare against (default: turbowarp, else
                                      scratch-vm, if selected, else the first selected engine other than bytecat)
        [--json] [-o results.json]    Exits with code 1 if an engine gave a wrong log or did not finish
  trace <file.sbp|file.sb3>       Run on Bytecat and TurboWarp in lockstep and compare what every frame shows
        [--frames 300] [--input file.input] [--seed 1]   (docs/testing.md); exits with code 1 on a difference
        [--fps 30] [--passes 50] [--turbo] [--json]
        [--browser]                   Against TurboWarp with its renderer, in Chromium (fencing, touching, clicks)
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", short: "o" },
    map: { type: "boolean" },
    timeout: { type: "string" },
    json: { type: "boolean" },
    answer: { type: "string", multiple: true },
    engine: { type: "string", default: "bytecat" },
    engines: { type: "string" },
    baseline: { type: "string" },
    runs: { type: "string", default: "5" },
    warmup: { type: "string", default: "1" },
    frames: { type: "string" },
    input: { type: "string" },
    seed: { type: "string" },
    fps: { type: "string" },
    passes: { type: "string" },
    turbo: { type: "boolean" },
    browser: { type: "boolean" },
    "runs-bytecat": { type: "string" },
    "warmup-bytecat": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, ...files] = positionals;

/** Prints what the compiler could not handle: unknown extensions first, then unsupported blocks. */
function printWarnings(result: CompileResult): void {
  for (const id of result.unknownExtensions) console.error(`warning: unknown extension ${id}; its blocks are skipped`);
  for (const w of result.warnings) console.error(`warning: unsupported block ${w}`);
}

function compileFile(path: string) {
  const source = readFileSync(path, "utf8");
  try {
    return compile(source, path);
  } catch (e) {
    if (e instanceof PseudoError) {
      console.error(e.format(source));
      process.exit(1);
    }
    throw e;
  }
}

function load(path: string): Uint8Array {
  if (extname(path) === ".sb3") return readFileSync(path);
  return writeSb3(compileFile(path).project);
}

function loadProject(path: string): Project {
  return readSb3(load(path));
}

function loadJson(path: string): ProjectJson {
  return loadProject(path).json;
}

/** The inputs a command accepts: the file itself, or every .sbp in a directory. */
function sbpFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((f) => f.endsWith(".sbp"))
    .sort()
    .map((f) => join(path, f));
}

function need(n: number): void {
  if (files.length < n) {
    console.error(USAGE);
    process.exit(2);
  }
}

switch (command) {
  case "build": {
    need(1);
    const input = files[0]!;
    const isDir = statSync(input).isDirectory();
    for (const file of sbpFiles(input)) {
      const name = basename(file, ".sbp");
      const out = isDir || !values.out ? join(values.out ?? (isDir ? "out" : dirname(file)), `${name}.sb3`) : values.out;
      const result = compileFile(file);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, writeSb3(result.project));
      if (values.map) writeFileSync(out.replace(/\.sb3$/, ".map.json"), JSON.stringify(result.sourceMap, null, 2));
      console.log(`${file} -> ${out}`);
    }
    break;
  }
  case "check": {
    need(1);
    for (const file of files.flatMap(sbpFiles)) {
      const { project } = compileFile(file);
      const blocks = project.json.targets.reduce((n, t) => n + Object.keys(t.blocks).length, 0);
      console.log(`${file}: ok (${project.json.targets.length - 1} sprite(s), ${blocks} blocks)`);
    }
    break;
  }
  case "dump": {
    need(1);
    console.log(JSON.stringify(readSb3(load(files[0]!)).json, null, 2));
    break;
  }
  case "compile": {
    need(1);
    const result = compileToJs(loadJson(files[0]!));
    printWarnings(result);
    if (values.out) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, toModule(result));
      console.log(`${files[0]} -> ${values.out}`);
    } else {
      process.stdout.write(toModule(result));
    }
    break;
  }
  case "bundle": {
    need(1);
    const input = files[0]!;
    const isDir = statSync(input).isDirectory();
    for (const file of sbpFiles(input)) {
      const name = basename(file, extname(file));
      const out = isDir || !values.out ? join(values.out ?? "out", `${name}.html`) : values.out;
      const project = loadProject(file);
      const result = compileProject(project.json);
      printWarnings(result);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, await bundleHtml(project, toModule(result), name));
      console.log(`${file} -> ${out}`);
    }
    break;
  }
  case "web": {
    const out = values.out ?? join("out", "web", "index.html");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await buildWebApp());
    console.log(`web app -> ${out}`);
    break;
  }
  case "run": {
    need(1);
    const timeoutMs = values.timeout ? Number(values.timeout) : 10_000;
    const answers = values.answer ?? [];
    if (values.engine === "reference" || values.engine === "turbowarp") {
      const engine = values.engine === "reference" ? "scratch" : "turbowarp";
      const result = await runProject(load(files[0]!), { timeoutMs, answers, engine });
      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.log) console.log(line);
        for (const s of result.says) console.error(`[${s.sprite} ${s.kind}s] ${s.text}`);
        for (const e of result.compileErrors) console.error(`warning: TurboWarp could not compile ${e}`);
        console.error(`${result.finished ? "finished" : "timed out"} in ${result.elapsedMs.toFixed(0)} ms`);
      }
      if (!result.finished) process.exitCode = 3;
    } else if (values.engine === "bytecat") {
      const project = loadProject(files[0]!);
      const json = project.json;
      const compiled = compileToJs(json);
      const { program, warnings } = compiled;
      const rt = new Runtime(json, program, { clock: "virtual", turbo: true, answers, costumeSizes: costumeSizes(project) });
      const { finished, elapsedMs, frames } = rt.runUntilDone(timeoutMs);
      const log = rt.log();
      if (values.json) {
        console.log(JSON.stringify({ log, says: rt.says, finished, elapsedMs, frames, warnings }, null, 2));
      } else {
        for (const line of log) console.log(line);
        for (const s of rt.says) console.error(`[${s.target} ${s.kind}s] ${s.text}`);
        printWarnings(compiled);
        console.error(`${finished ? "finished" : "timed out"} in ${elapsedMs.toFixed(0)} ms`);
      }
      if (!finished) process.exitCode = 3;
    } else {
      console.error(`unknown engine "${values.engine}" (expected bytecat, reference or turbowarp)`);
      process.exit(2);
    }
    break;
  }
  case "bench": {
    const dir = "bench";
    const names = files.length
      ? files.map((f) => basename(f, ".sbp"))
      : sbpFiles(dir).map((f) => basename(f, ".sbp"));
    const engines = (values.engines ?? engineNames().join(",")).split(",").map((n) => {
      try {
        return getEngine(n.trim());
      } catch (e) {
        console.error(`${(e as Error).message} (engines: ${engineNames().join(", ")})`);
        process.exit(2);
      }
    });
    const selected = engines.map((e) => e.name);
    const baseline = pickBaseline(selected, values.baseline);
    if (baseline === undefined) {
      console.error(`--baseline must be one of the selected engines: ${selected.join(", ")}`);
      process.exit(2);
    }
    const runs = Number(values.runs);
    const warmup = Number(values.warmup);
    const bytecatRuns = values["runs-bytecat"] === undefined ? undefined : Number(values["runs-bytecat"]);
    const bytecatWarmup = values["warmup-bytecat"] === undefined ? undefined : Number(values["warmup-bytecat"]);
    if (
      (bytecatRuns !== undefined && (!Number.isInteger(bytecatRuns) || bytecatRuns < 1)) ||
      (bytecatWarmup !== undefined && (!Number.isInteger(bytecatWarmup) || bytecatWarmup < 0))
    ) {
      console.error("--runs-bytecat must be a positive integer and --warmup-bytecat a non-negative integer");
      process.exit(2);
    }
    const engineRuns: Record<string, number> = bytecatRuns === undefined ? {} : { bytecat: bytecatRuns };
    const engineWarmup: Record<string, number> = bytecatWarmup === undefined ? {} : { bytecat: bytecatWarmup };
    const timeoutMs = values.timeout === undefined ? 60_000 : Number(values.timeout);
    if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmup) || warmup < 0 || !(timeoutMs > 0)) {
      console.error("--runs must be a positive integer, --warmup a non-negative integer and --timeout a positive number");
      process.exit(2);
    }
    const results: BenchResult[] = [];
    for (const name of names) {
      const path = join(dir, `${name}.sbp`);
      const expectedPath = join(dir, `${name}.expected`);
      let expected: string[];
      try {
        expected = readFileSync(expectedPath, "utf8").split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
        statSync(path);
      } catch {
        console.error(`cannot read ${path} and ${expectedPath}`);
        process.exit(2);
      }
      if (!values.json) console.error(`benchmarking ${name}...`);
      results.push(await benchmark(name, compileFile(path).project, expected, engines, { runs, warmup, timeoutMs, engineRuns, engineWarmup }));
    }
    if (values.out) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, JSON.stringify(results, null, 2) + "\n");
    }
    if (values.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(formatTable(results, baseline));
      const compiles = results.flatMap((r) => r.engines.filter((e) => e.compileMs !== undefined).map((e) => `${r.name} ${e.compileMs!.toFixed(1)} ms`));
      if (compiles.length) console.log(`\nCompile time (not included above): ${compiles.join(", ")}`);
    }
    let failed = false;
    for (const r of results) {
      for (const e of r.engines) {
        if (e.error) {
          console.error(`${r.name} on ${e.engine}: ${e.error}`);
          failed = true;
        }
      }
    }
    if (failed) process.exitCode = 1;
    break;
  }
  case "trace": {
    need(1);
    const int = (name: string, text: string | undefined, fallback: number, min = 1): number => {
      const n = text === undefined ? fallback : Number(text);
      if (!Number.isInteger(n) || n < min) {
        console.error(`--${name} must be an integer of at least ${min}`);
        process.exit(2);
      }
      return n;
    };
    const input = values.input ? parseInput(readFileSync(values.input, "utf8"), values.input) : [];
    const options = {
      frames: int("frames", values.frames, 300),
      input,
      seed: int("seed", values.seed, 1, 0),
      fps: int("fps", values.fps, 30),
      passes: int("passes", values.passes, 50),
      turbo: values.turbo ?? false,
    };
    const sb3 = load(files[0]!);
    let result;
    if (values.browser) {
      // Loaded only here: the browser oracle needs Playwright and esbuild.
      const { BrowserOracle } = await import("@bytecat/trace/browser");
      const oracle = await BrowserOracle.launch();
      try {
        result = await oracle.trace(sb3, options);
      } finally {
        await oracle.close();
      }
    } else {
      result = await traceProject(sb3, options);
    }
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else console.log(describeTrace(result));
    if (result.diff || result.problems.length) process.exitCode = 1;
    break;
  }
  default:
    console.log(USAGE);
    process.exit(values.help || !command ? 0 : 2);
}

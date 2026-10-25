#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { compile as compileToJs, compileProject, toModule } from "@bytecat/compiler";
import { benchmark, engineNames, formatTable, getEngine, type BenchResult } from "@bytecat/bench";
import { bundleHtml } from "@bytecat/player/bundle";
import { compile, PseudoError } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import { Runtime } from "@bytecat/runtime";
import { readSb3, writeSb3, type Project, type ProjectJson } from "@bytecat/sb3";

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
  run <file.sbp|file.sb3>         Run and print log() output and say bubbles
        [--engine bytecat|reference|turbowarp]  bytecat (default) is the compiled runtime,
                                  reference is scratch-vm, turbowarp is TurboWarp's VM with its compiler
        [--timeout ms] [--json] [--answer text]...
  bench [names...]                Time bench/NAME.sbp (default: every bench/*.sbp) on each engine and check its output
        [--engines bytecat,scratch-vm,turbowarp] [--runs 5] [--warmup 1]   (default: every engine)
        [--baseline scratch-vm]       Engine the speedup columns compare against
        [--json] [-o results.json]    Exits with code 1 if an engine gave a wrong log or did not finish
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
    baseline: { type: "string", default: "scratch-vm" },
    runs: { type: "string", default: "5" },
    warmup: { type: "string", default: "1" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, ...files] = positionals;

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
    const { code, warnings } = compileToJs(loadJson(files[0]!));
    for (const w of warnings) console.error(`warning: unsupported block ${w}`);
    if (values.out) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, toModule(code));
      console.log(`${files[0]} -> ${values.out}`);
    } else {
      process.stdout.write(toModule(code));
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
      const { code, warnings } = compileProject(project.json);
      for (const w of warnings) console.error(`warning: unsupported block ${w}`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, await bundleHtml(project, code, name));
      console.log(`${file} -> ${out}`);
    }
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
      const json = loadJson(files[0]!);
      const { program, warnings } = compileToJs(json);
      const rt = new Runtime(json, program, { clock: "virtual", turbo: true, answers });
      const { finished, elapsedMs, frames } = rt.runUntilDone(timeoutMs);
      const log = rt.log();
      if (values.json) {
        console.log(JSON.stringify({ log, says: rt.says, finished, elapsedMs, frames, warnings }, null, 2));
      } else {
        for (const line of log) console.log(line);
        for (const s of rt.says) console.error(`[${s.target} ${s.kind}s] ${s.text}`);
        for (const w of warnings) console.error(`warning: unsupported block ${w}`);
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
    const runs = Number(values.runs);
    const warmup = Number(values.warmup);
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
      results.push(await benchmark(name, compileFile(path).project, expected, engines, { runs, warmup, timeoutMs }));
    }
    if (values.out) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, JSON.stringify(results, null, 2) + "\n");
    }
    if (values.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(formatTable(results, values.baseline));
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
  default:
    console.log(USAGE);
    process.exit(values.help || !command ? 0 : 2);
}

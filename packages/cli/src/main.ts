#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { compile, PseudoError } from "@bytecat/pseudo";
import { runProject } from "@bytecat/reference";
import { readSb3, writeSb3 } from "@bytecat/sb3";

const USAGE = `Usage: bytecat <command> [options]

Commands:
  build <file.sbp|dir> [-o out]   Compile pseudocode to .sb3 (a directory builds every .sbp in it)
        [--map]                   Also write <name>.map.json mapping block ids to source lines
  check <file.sbp...>             Parse and compile without writing anything
  dump <file.sbp|file.sb3>        Print project.json
  run <file.sbp|file.sb3>         Run in the reference Scratch VM and print log() output and say bubbles
        [--timeout ms] [--json] [--answer text]...
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", short: "o" },
    map: { type: "boolean" },
    timeout: { type: "string" },
    json: { type: "boolean" },
    answer: { type: "string", multiple: true },
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
  case "run": {
    need(1);
    const result = await runProject(load(files[0]!), {
      timeoutMs: values.timeout ? Number(values.timeout) : 10_000,
      answers: values.answer ?? [],
    });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const line of result.log) console.log(line);
      for (const s of result.says) console.error(`[${s.sprite} ${s.kind}s] ${s.text}`);
      console.error(`${result.finished ? "finished" : "timed out"} in ${result.elapsedMs.toFixed(0)} ms`);
    }
    if (!result.finished) process.exitCode = 3;
    break;
  }
  default:
    console.log(USAGE);
    process.exit(values.help || !command ? 0 : 2);
}

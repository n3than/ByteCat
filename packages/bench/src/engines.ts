import { compile } from "@bytecat/compiler";
import { runProject } from "@bytecat/reference";
import { Runtime } from "@bytecat/runtime";
import { writeSb3, type Project } from "@bytecat/sb3";

export interface EngineResult {
  /** The stage `log` list after the run. */
  log: string[];
  finished: boolean;
  /** Time from green flag until every script stopped. */
  runMs: number;
  /** Time spent compiling, for engines that compile ahead of the run. */
  compileMs?: number;
}

/**
 * Something that can run a Scratch project headlessly and report its `log` output.
 * Every engine runs in turbo mode and is timed from the green flag to the last script stopping.
 */
export interface Engine {
  name: string;
  description: string;
  run(project: Project, options: { timeoutMs: number }): Promise<EngineResult>;
}

export const bytecat: Engine = {
  name: "bytecat",
  description: "Bytecat compiler and headless runtime (virtual clock, turbo)",
  async run(project, { timeoutMs }) {
    const t0 = performance.now();
    const { program } = compile(project.json);
    const compileMs = performance.now() - t0;
    const rt = new Runtime(project.json, program, { clock: "virtual", turbo: true });
    const r = rt.runUntilDone(timeoutMs);
    return { log: rt.log(), finished: r.finished, runMs: r.elapsedMs, compileMs };
  },
};

export const scratchVm: Engine = {
  name: "scratch-vm",
  description: "The official Scratch VM, headless, turbo mode",
  async run(project, { timeoutMs }) {
    const r = await runProject(writeSb3(project), { timeoutMs, turbo: true });
    return { log: r.log, finished: r.finished, runMs: r.elapsedMs };
  },
};

const registry = new Map<string, Engine>([bytecat, scratchVm].map((e) => [e.name, e]));

/** Adds an engine (for example TurboWarp) so `pnpm bench --engines` can select it. */
export function registerEngine(engine: Engine): void {
  registry.set(engine.name, engine);
}

export function getEngine(name: string): Engine {
  const e = registry.get(name);
  if (!e) throw new Error(`unknown engine '${name}', available: ${[...registry.keys()].join(", ")}`);
  return e;
}

export function engineNames(): string[] {
  return [...registry.keys()];
}

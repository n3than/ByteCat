// Before turbowarp-vm: TurboWarp's ids must come from a counter, not Math.random (see tw-ids.ts).
import "./tw-ids.js";
import { silenced } from "./quiet.js";
import ScratchVM from "scratch-vm";
import TurboWarpVM from "turbowarp-vm";

export { TurboWarpLockstep } from "./lockstep.js";
export { patchTurboWarp, TurboWarpLockstepCore, type LockstepOptions, type TurboWarpModules } from "./tw-lockstep.js";
export { DEFAULT_DATE, flushPromises, mulberry32, VirtualTimers, withTimerLabel, withVirtualGlobals, type VirtualGlobals } from "./virtual.js";
export { turbowarpUidReplacement, turbowarpUsesCounterIds } from "./tw-ids.js";

/**
 * Which VM runs the project. `turbowarp` is TurboWarp's fork with its JavaScript compiler enabled,
 * the oracle for behaviour and the engine Bytecat is measured against. `scratch` is the official
 * scratch-vm, kept as a second check.
 */
export { turbowarpBlocks, type TurboWarpBlocks, type TurboWarpHat } from "./blocks.js";

export type Engine = "scratch" | "turbowarp";

export const engines: readonly Engine[] = ["scratch", "turbowarp"];

export interface RunOptions {
  /** Stop after this many milliseconds even if scripts are still running. Default 10000. */
  timeoutMs?: number;
  /** Answers given to `ask` blocks, in order. Missing answers are empty strings. */
  answers?: string[];
  /** Run in turbo mode (no screen refresh between loop iterations). Default true. */
  turbo?: boolean;
  /** The VM to run in. Default `scratch`. */
  engine?: Engine;
  /** Hide the VM's warnings while the project runs too (the fuzzer uses it). Default false. */
  quiet?: boolean;
}

export interface RunResult {
  /** Items appended to the stage list `log`, in order. */
  log: string[];
  /** Every say/think bubble shown, in order. Empty bubbles (clearing) are skipped. */
  says: { sprite: string; kind: "say" | "think"; text: string }[];
  /** Final variable values, keyed by "Sprite.name" (or "Stage.name" for globals). */
  variables: Record<string, unknown>;
  /** Whether every script finished before the timeout. */
  finished: boolean;
  elapsedMs: number;
  /**
   * Scripts that TurboWarp could not compile and ran in its interpreter instead, as
   * "Sprite: message". Always empty for scratch-vm.
   */
  compileErrors: string[];
  /** Threads TurboWarp started as compiled JavaScript. Always 0 for scratch-vm. */
  compiledThreads: number;
}

interface TwThread {
  triedToCompile?: boolean;
  isCompiled?: boolean;
}

/**
 * Loads an .sb3 into scratch-vm (or TurboWarp), clicks the green flag, and waits for all scripts to
 * stop. This is the reference behaviour that Bytecat's compiled output is compared against.
 */
export async function runProject(sb3: Uint8Array, options: RunOptions = {}): Promise<RunResult> {
  return options.quiet ? silenced(() => runLoaded(sb3, options)) : runLoaded(sb3, options);
}

async function runLoaded(sb3: Uint8Array, options: RunOptions): Promise<RunResult> {
  const { timeoutMs = 10_000, answers = [], turbo = true, engine = "scratch" } = options;
  const vm = await silenced(async () => (engine === "turbowarp" ? new TurboWarpVM() : new ScratchVM()));
  const compileErrors: string[] = [];
  let compiledThreads = 0;
  if (vm instanceof TurboWarpVM) {
    vm.setCompilerOptions({ enabled: true, warpTimer: false });
    vm.runtime.on("COMPILE_ERROR", (target: { getName(): string }, error: unknown) => {
      compileErrors.push(`${target.getName()}: ${error instanceof Error ? error.message : String(error)}`);
    });
    // TurboWarp compiles each thread as the runtime starts it; count the ones that came out compiled.
    const runtime = vm.runtime as unknown as Record<string, (...args: unknown[]) => TwThread>;
    for (const method of ["_pushThread", "_restartThread"]) {
      const original = runtime[method]!.bind(runtime);
      runtime[method] = (...args) => {
        const thread = original(...args);
        if (thread.triedToCompile && thread.isCompiled) compiledThreads++;
        return thread;
      };
    }
  }
  const says: RunResult["says"] = [];
  vm.runtime.on("SAY", (target: { getName(): string }, kind: "say" | "think", text: unknown) => {
    if (text !== "" && text !== undefined) says.push({ sprite: target.getName(), kind, text: String(text) });
  });
  let answerIndex = 0;
  vm.runtime.on("QUESTION", (question: unknown) => {
    // A null question means the prompt was closed, not a new question.
    if (question !== null) setTimeout(() => vm.runtime.emit("ANSWER", answers[answerIndex++] ?? ""), 0);
  });

  await silenced(() => vm.loadProject(sb3));
  vm.setTurboMode(turbo);
  vm.start();
  const started = performance.now();
  vm.greenFlag();

  const finished = await new Promise<boolean>((resolve) => {
    const poll = setInterval(() => {
      if (vm.runtime.threads.length === 0) {
        clearInterval(poll);
        resolve(true);
      } else if (performance.now() - started > timeoutMs) {
        clearInterval(poll);
        resolve(false);
      }
    }, 1);
  });
  const elapsedMs = performance.now() - started;
  vm.stopAll();
  vm.quit();

  const variables: Record<string, unknown> = {};
  let log: string[] = [];
  for (const target of vm.runtime.targets) {
    for (const v of Object.values(target.variables)) {
      if (v.type === "") variables[`${target.getName()}.${v.name}`] = v.value;
      if (target.isStage && v.type === "list" && v.name === "log") log = (v.value as unknown[]).map(String);
    }
  }
  return { log, says, variables, finished, elapsedMs, compileErrors, compiledThreads };
}


import VirtualMachine from "scratch-vm";

export interface RunOptions {
  /** Stop after this many milliseconds even if scripts are still running. Default 10000. */
  timeoutMs?: number;
  /** Answers given to `ask` blocks, in order. Missing answers are empty strings. */
  answers?: string[];
  /** Run in turbo mode (no screen refresh between loop iterations). Default true. */
  turbo?: boolean;
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
}

/**
 * Loads an .sb3 into scratch-vm, clicks the green flag, and waits for all scripts to stop.
 * This is the reference behaviour that Bytecat's compiled output is compared against.
 */
export async function runProject(sb3: Uint8Array, options: RunOptions = {}): Promise<RunResult> {
  const { timeoutMs = 10_000, answers = [], turbo = true } = options;
  const vm = await silenced(async () => new VirtualMachine());
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
    }, 5);
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
  return { log, says, variables, finished, elapsedMs };
}

/** scratch-vm logs noisy warnings at startup and about the missing renderer; hide them while it sets up. */
async function silenced<T>(fn: () => Promise<T>): Promise<T> {
  const { log, warn, info } = console;
  console.log = console.warn = console.info = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, info });
  }
}

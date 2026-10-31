// Bytecat as a lockstep engine: the compiled program on the real scheduler (`Runtime.tick`), with a
// virtual clock, a pass-counting scheduler clock and no lone-thread spin, so a frame does exactly
// the work TurboWarp's does (docs/testing.md, "Frame boundaries").
import { compile } from "@bytecat/compiler";
import type { RenderBackend } from "@bytecat/player";
import { DEFAULT_DATE, flushPromises, mulberry32, withVirtualGlobals, type VirtualGlobals } from "@bytecat/reference/virtual";
import { passClock, Runtime, turbowarpCompat, type RuntimeOptions } from "@bytecat/runtime";
import type { CostumeSizes, ProjectJson } from "@bytecat/sb3";
import type { FrameOptions, LockstepEngine } from "./engine.js";
import { cloneLabels, toSnapshot, type Snapshot, type StageState } from "./snapshot.js";

/**
 * The runtime options of every exact check against TurboWarp: the frame-by-frame trace, the fuzzer
 * and the log comparisons in tests/compiler.test.ts. They copy TurboWarp's limits, so exactness is
 * meaningful there. Set this to `{}` to drop the compat mode: the exact checks then run Bytecat's
 * own defaults, like the relaxed comparison.
 */
export const EXACT_COMPAT: Readonly<RuntimeOptions> = turbowarpCompat;

/** The raw visible state of a Bytecat runtime. */
export function bytecatState(rt: Runtime): StageState {
  const label = cloneLabels(rt.targets, (t) => t.name, (t) => t.isOriginal);
  const targets = rt.targets.map((t) => {
    const json = rt.project.targets[t.index]!;
    return {
      name: label.get(t)!,
      isStage: t.isStage,
      variables: Object.entries(json.variables).map(([id, [name]]) => [name, t.v[id]] as [string, unknown]),
      lists: Object.entries(json.lists).map(([id, [name]]) => [name, t.l[id] ?? []] as [string, unknown[]]),
      costume: t.costume,
      costumeName: t.costumes[t.costume]?.name ?? "",
      ...(t.isStage
        ? {}
        : {
            x: t.x,
            y: t.y,
            direction: t.direction,
            size: t.size,
            visible: t.visible,
            rotationStyle: t.rotationStyle,
            bubble: t.bubble,
          }),
    };
  });
  // Back to front; no two targets share a layer (Target.all).
  const layers = rt.targets
    .filter((t) => !t.isStage)
    .sort((a, b) => a.layer - b.layer)
    .map((t) => label.get(t)!);
  return { targets, layers };
}

export class BytecatLockstep implements LockstepEngine {
  readonly name = "bytecat";
  readonly rt: Runtime;
  readonly questions: string[] = [];
  readonly problems: string[] = [];
  private readonly resolvers: ((answer: string) => void)[] = [];
  private readonly clock: ReturnType<typeof passClock>;
  private readonly env: VirtualGlobals;

  /** `costumeSizes`: the costume images' sizes, so that sprites are fenced and clamped (`RuntimeOptions`). */
  constructor(project: ProjectJson, options: FrameOptions = {}, costumeSizes?: CostumeSizes) {
    const { fps = 30, turbo = false, passes = 50, seed = 1, date = DEFAULT_DATE, compat = EXACT_COMPAT } = options;
    const { program, warnings } = compile(project);
    for (const w of warnings) this.problems.push(`bytecat does not support ${w}`);
    this.clock = passClock(passes, fps);
    const rt = new Runtime(project, program, { ...compat, clock: "virtual", fps, turbo, schedulerClock: this.clock.read, costumeSizes });
    // One loop iteration per step, as in TurboWarp: `spin` (how many iterations a lone thread may
    // run without yielding) always reads 0 and ignores writes, so loops yield every iteration. This
    // is done here, on this instance only, so the scheduler's hot loop has no lockstep option.
    Object.defineProperty(rt, "spin", { get: () => 0, set: () => {}, configurable: true });
    this.rt = rt;
    rt.onAsk = (question) =>
      new Promise((resolve) => {
        this.questions.push(question);
        this.resolvers.push(resolve);
      });
    this.env = { random: mulberry32(seed), date: () => date + rt.now() };
    withVirtualGlobals(this.env, () => rt.greenFlag());
  }

  step(): void {
    this.clock.reset();
    withVirtualGlobals(this.env, () => this.rt.tick());
  }

  snapshot(frame: number): Snapshot {
    return toSnapshot(frame, bytecatState(this.rt));
  }

  get running(): boolean {
    return this.rt.running;
  }

  keyDown(key: string): void {
    this.rt.keyDown(key);
  }

  keyUp(key: string): void {
    this.rt.keyUp(key);
  }

  mouseMove(x: number, y: number): void {
    this.rt.mouse.x = x;
    this.rt.mouse.y = y;
  }

  /**
   * The renderer that hit-tests clicks (the browser oracle sets one). Without it a click hits the
   * stage, like headless TurboWarp.
   */
  renderer: RenderBackend | null = null;

  click(x: number, y: number): void {
    this.mouseMove(x, y);
    this.renderer?.sync();
    this.rt.click(this.renderer?.pick(x, y) ?? this.rt.stage);
  }

  async answer(text: string): Promise<void> {
    this.questions.shift();
    this.resolvers.shift()?.(text);
    await flushPromises();
  }

  dispose(): void {
    this.rt.stopAll();
  }
}

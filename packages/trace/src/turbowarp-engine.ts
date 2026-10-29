// TurboWarp (compiler on) as a lockstep engine, on @bytecat/reference's lockstep driver. No Node
// imports: the browser oracle wraps a VM with a renderer in the same class (turbowarp.ts loads the
// headless one in Node).
import type { TurboWarpLockstepCore } from "@bytecat/reference/lockstep";
import type { LockstepEngine } from "./engine.js";
import { toSnapshot, type Snapshot, type StageState } from "./snapshot.js";

// TurboWarp's targets, as far as the snapshot reads them.
interface TwVariable {
  name: string;
  type: string;
  value: unknown;
}
interface TwTarget {
  isStage: boolean;
  isOriginal: boolean;
  getName(): string;
  variables: Record<string, TwVariable>;
  currentCostume: number;
  getCostumes(): { name: string }[];
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  rotationStyle: string;
  getCustomState(key: string): { type?: string; text?: string } | undefined;
}

/** The raw visible state of a TurboWarp runtime (`vm.runtime`). */
export function turbowarpState(runtime: { targets: TwTarget[]; executableTargets: TwTarget[] }): StageState {
  const targets = runtime.targets
    .filter((t) => t.isOriginal)
    .map((t) => {
      const vars = Object.values(t.variables);
      const bubble = t.getCustomState("Scratch.looks");
      return {
        name: t.getName(),
        isStage: t.isStage,
        variables: vars.filter((v) => v.type === "").map((v) => [v.name, v.value] as [string, unknown]),
        lists: vars.filter((v) => v.type === "list").map((v) => [v.name, v.value as unknown[]] as [string, unknown[]]),
        costume: t.currentCostume,
        costumeName: t.getCostumes()[t.currentCostume]?.name ?? "",
        ...(t.isStage
          ? {}
          : {
              x: t.x,
              y: t.y,
              direction: t.direction,
              size: t.size,
              visible: t.visible,
              rotationStyle: t.rotationStyle,
              bubble: bubble?.text ? { kind: bubble.type ?? "say", text: bubble.text } : null,
            }),
      };
    });
  // The executable order is the layer order, back to front after the stage (TurboWarp keeps it in
  // step with the renderer's drawable order).
  const layers = runtime.executableTargets.filter((t) => !t.isStage && t.isOriginal).map((t) => t.getName());
  return { targets, layers };
}

export class TurboWarpEngineCore implements LockstepEngine {
  readonly name: string = "turbowarp";

  constructor(readonly tw: TurboWarpLockstepCore) {}

  step(): Promise<void> {
    return this.tw.step();
  }

  snapshot(frame: number): Snapshot {
    return toSnapshot(frame, turbowarpState(this.tw.runtime as never));
  }

  get running(): boolean {
    return this.tw.running;
  }

  get questions(): readonly string[] {
    return this.tw.questions;
  }

  get problems(): readonly string[] {
    return this.tw.compileErrors.map((e) => `turbowarp could not compile ${e}`);
  }

  keyDown(key: string): void {
    this.tw.keyDown(key);
  }

  keyUp(key: string): void {
    this.tw.keyUp(key);
  }

  mouseMove(x: number, y: number): void {
    this.tw.mouseMove(x, y);
  }

  click(x: number, y: number): void {
    this.tw.click(x, y);
  }

  answer(text: string): Promise<void> {
    return this.tw.answer(text);
  }

  dispose(): void {
    this.tw.dispose();
  }
}

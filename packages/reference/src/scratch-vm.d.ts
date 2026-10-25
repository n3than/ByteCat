// Minimal typings for the parts of scratch-vm (and TurboWarp's fork of it) that the reference runner uses.
declare module "scratch-vm" {
  interface Variable {
    name: string;
    type: string;
    value: unknown;
  }
  interface RenderedTarget {
    isStage: boolean;
    getName(): string;
    variables: Record<string, Variable>;
  }
  interface Runtime {
    threads: unknown[];
    targets: RenderedTarget[];
    currentStepTime: number;
    on(event: string, listener: (...args: any[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
  }
  class VirtualMachine {
    runtime: Runtime;
    loadProject(input: ArrayBuffer | Uint8Array | string | object): Promise<void>;
    setTurboMode(on: boolean): void;
    setCompatibilityMode(on: boolean): void;
    /** TurboWarp only. */
    setCompilerOptions(options: { enabled?: boolean; warpTimer?: boolean }): void;
    start(): void;
    stopAll(): void;
    quit(): void;
    greenFlag(): void;
  }
  export default VirtualMachine;
}

// TurboWarp's fork, installed from GitHub under an alias. Same API, plus the compiler options.
declare module "turbowarp-vm" {
  import VirtualMachine from "scratch-vm";
  export default VirtualMachine;
}

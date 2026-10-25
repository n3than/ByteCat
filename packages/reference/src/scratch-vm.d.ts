// Minimal typings for the parts of scratch-vm that the reference runner uses.
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
    start(): void;
    stopAll(): void;
    quit(): void;
    greenFlag(): void;
  }
  export default VirtualMachine;
}

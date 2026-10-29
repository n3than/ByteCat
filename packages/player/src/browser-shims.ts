// Globals that Scratch's renderer, VM and storage expect from webpack 4's Node polyfills. esbuild
// injects these exports wherever a bundled module uses `Buffer` or `process` without importing them
// (see scratch-esbuild.ts).
import { Buffer } from "buffer";

export { Buffer };

export const process = {
  env: { NODE_ENV: "production" } as Record<string, string>,
  browser: true,
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => fn(...args)),
};

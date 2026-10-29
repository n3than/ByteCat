// Browser entry point bundled into every standalone page. The page defines `window.BYTECAT`
// with the project, its compiled program and assets before this script runs.
import type { ProgramFactory } from "@bytecat/runtime";
import { RUNTIME_MODULES } from "@bytecat/runtime/modules";
import type { ProjectJson } from "@bytecat/sb3";
import { createPlayer, type Player } from "./player.js";

interface PageData {
  project: ProjectJson;
  /** The compiled program as `toScript` writes it: it takes the runtime modules it imports from. */
  program: (modules: typeof RUNTIME_MODULES) => ProgramFactory;
  assets: Record<string, string>;
}

declare global {
  interface Window {
    BYTECAT: PageData;
    /** Set once the player is ready. Tests drive the page through it. */
    bytecat?: Player;
  }
}

const params = new URLSearchParams(location.search);
const test = params.has("test");
// Test mode runs in turbo by default; `?test&turbo=off` makes a redraw end the frame, like the
// live player, so a test can check what is on the canvas after a given number of frames.
const turbo = test && params.get("turbo") !== "off";
const answers = params.getAll("answer");
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const data = window.BYTECAT;

createPlayer({ canvas, project: data.project, program: data.program(RUNTIME_MODULES), assets: data.assets, test, turbo, answers }).then((player) => {
  window.bytecat = player;
  document.getElementById("flag")?.addEventListener("click", () => player.greenFlag());
  document.getElementById("stop")?.addEventListener("click", () => player.stop());
  if (!test && !params.has("paused")) player.greenFlag();
  document.body.dataset.ready = "true";
});

// Starts the player on a standalone page. The page defines `window.BYTECAT` with the project and
// its assets before the player script runs; the script brings the program (`bundle.ts`).
import type { ProgramFactory } from "@bytecat/runtime";
import type { ProjectJson } from "@bytecat/sb3";
import { createPlayer, type Player } from "./player.js";

export interface PageData {
  project: ProjectJson;
  assets: Record<string, string>;
  /**
   * The program as `toScript` (in @bytecat/compiler) writes it, a function of the runtime modules.
   * Only on a page for the full player (`main.ts`); a per-project bundle carries its program.
   */
  program?: (modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>) => ProgramFactory;
}

declare global {
  interface Window {
    BYTECAT: PageData;
    /** Set once the player is ready. Tests drive the page through it. */
    bytecat?: Player;
  }
}

export function start(program: ProgramFactory): void {
  const params = new URLSearchParams(location.search);
  const test = params.has("test");
  // Test mode runs in turbo by default; `?test&turbo=off` makes a redraw end the frame, like the
  // live player, so a test can check what is on the canvas after a given number of frames.
  const turbo = test && params.get("turbo") !== "off";
  const answers = params.getAll("answer");
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const data = window.BYTECAT;

  createPlayer({ canvas, project: data.project, program, assets: data.assets, test, turbo, answers }).then((player) => {
    window.bytecat = player;
    document.getElementById("flag")?.addEventListener("click", () => player.greenFlag());
    document.getElementById("stop")?.addEventListener("click", () => player.stop());
    if (!test && !params.has("paused")) player.greenFlag();
    document.body.dataset.ready = "true";
  });
}

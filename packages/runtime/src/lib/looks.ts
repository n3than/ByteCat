import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { BLOCKED } from "../thread.js";

export function say(rt: Runtime, t: Target, kind: "say" | "think", text: Value): void {
  const s = ops.toStr(text);
  t.bubble = s === "" ? null : { kind, text: s };
  if (s !== "") rt.says.push({ target: t.name, kind, text: s });
  // As with TurboWarp's renderer: a redraw only when a bubble appears on a visible sprite or one
  // that is drawn goes away.
  if (s !== "" && t.visible) {
    t.bubbleDrawn = true;
    rt.requestRedraw();
  } else if (t.bubbleDrawn) {
    t.bubbleDrawn = false;
    rt.requestRedraw();
  }
}

export function* sayFor(
  rt: Runtime,
  t: Target,
  kind: "say" | "think",
  text: Value,
  seconds: number,
): Generator<unknown, void, unknown> {
  // TurboWarp's sayforsecs returns a promise (STATUS_PROMISE_WAIT, so BLOCKED here) that a
  // setTimeout callback resolves between frames, after it clears the bubble unless another say
  // replaced it. That clear asks for a redraw, but `_step` drops it before the next frame.
  say(rt, t, kind, text);
  const bubble = t.bubble;
  let done = false;
  rt.bubbleTimeout = rt.later(seconds * 1000, () => {
    // Whichever timer it is, as TurboWarp's callback sets `_bubbleTimeout = null`: an earlier
    // timer that runs makes it forget a later pending one, which stop all then leaves alone.
    rt.bubbleTimeout = null;
    if (t.bubble === bubble) say(rt, t, kind, "");
    done = true;
  });
  while (!done) yield BLOCKED;
}

export function switchCostume(rt: Runtime, t: Target, value: Value): void {
  const i = t.costumes.findIndex((c) => c.name === value);
  if (i >= 0) t.costume = i;
  else if (value === "next costume" || value === "next backdrop") t.costume = (t.costume + 1) % t.costumes.length;
  else if (value === "previous costume" || value === "previous backdrop") t.costume = ops.mod(t.costume - 1, t.costumes.length);
  else if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    t.costume = ops.mod(Math.round(ops.toNum(value)) - 1, t.costumes.length);
  } else {
    // No such costume: TurboWarp's `_setCostume` does not call setCostume, so nothing redraws.
    return;
  }
  // TurboWarp redraws for a costume change only when it shows (the stage is always visible).
  if (t.visible) rt.requestRedraw();
}

export function nextCostume(rt: Runtime, t: Target): void {
  t.costume = (t.costume + 1) % t.costumes.length;
  if (t.visible) rt.requestRedraw();
}

export function costumeName(t: Target): string {
  return t.costumes[t.costume]?.name ?? "";
}

/**
 * RenderedTarget's `setSize`: with a geometry, the size is clamped to at most 1.5 times the stage
 * and at least 0, or with `RuntimeOptions.minSize` (TurboWarp) at least 5 pixels wide or high (or
 * the costume's own size, if smaller).
 */
export function setSize(rt: Runtime, t: Target, size: number): void {
  const costumeSize = rt.geometry?.costumeSize(t);
  if (costumeSize) {
    const [w, h] = costumeSize;
    // TurboWarp's minimum only with `minSize` (as with fencing off, the floor is then 0).
    const minScale = rt.options.minSize ? Math.min(1, Math.max(5 / w, 5 / h)) : 0;
    const maxScale = Math.min((1.5 * 480) / w, (1.5 * 360) / h);
    t.size = Math.min(Math.max(size / 100, minScale), maxScale) * 100;
  } else {
    t.size = size;
  }
  if (t.visible) rt.requestRedraw();
}

export function setVisible(rt: Runtime, t: Target, visible: boolean): void {
  t.visible = visible;
  // Like TurboWarp: showing a sprite redraws, hiding one does not. TurboWarp's show and hide then
  // re-render the bubble: showing brings back a bubble the sprite still has, and hiding removes
  // a drawn one, which redraws.
  if (visible) {
    if (t.bubble) t.bubbleDrawn = true;
    rt.requestRedraw();
  } else if (t.bubbleDrawn) {
    t.bubbleDrawn = false;
    rt.requestRedraw();
  }
}

export function goToFront(rt: Runtime, t: Target): void {
  if (t.isStage) return;
  const top = Math.max(...rt.targets.map((x) => x.layer));
  if (t.layer !== top) {
    t.layer = top + 1;
    rt.layersChanged();
  }
  // No redraw: TurboWarp's layer changes never request one, so they do not end a frame.
}

/** "go to back layer": behind every sprite, in front of the stage. */
export function goToBack(rt: Runtime, t: Target): void {
  moveLayers(rt, t, -Infinity);
}

/**
 * "go forward (n) layers" (a negative n goes backward): the sprite swaps places with the n targets
 * in its way, stopping in front of the stage at the back and at the front layer at the top, as
 * TurboWarp's `moveExecutable` does. The layers are renumbered to stay distinct (see `Target.all`).
 */
export function moveLayers(rt: Runtime, t: Target, delta: number): void {
  if (t.isStage) return;
  const order = [...rt.targets].sort((a, b) => a.layer - b.layer);
  const old = order.indexOf(t);
  order.splice(old, 1);
  // The stage is always the first, and no sprite goes behind it.
  const to = Math.min(Math.max(Math.trunc(old + delta), 1), order.length);
  if (to === old) return;
  order.splice(to, 0, t);
  order.forEach((x, i) => (x.layer = i));
  rt.layersChanged();
}

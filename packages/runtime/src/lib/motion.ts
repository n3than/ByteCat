import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { SLEEP, WAIT } from "../thread.js";

/** The stage is always this size (TurboWarp's default; custom stage sizes are not supported). */
const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;

export function setXY(rt: Runtime, t: Target, x: number, y: number): void {
  t.x = x;
  t.y = y;
  if (t.visible) rt.requestRedraw();
}

export function move(rt: Runtime, t: Target, steps: number): void {
  const rad = ((90 - t.direction) * Math.PI) / 180;
  setXY(rt, t, t.x + steps * Math.cos(rad), t.y + steps * Math.sin(rad));
}

/** A random position on the stage, as TurboWarp's `getTargetXY` draws it (x first, then y). */
function randomX(): number {
  return Math.round(STAGE_WIDTH * (Math.random() - 0.5));
}
function randomY(): number {
  return Math.round(STAGE_HEIGHT * (Math.random() - 0.5));
}

/**
 * The sprite a menu names, as TurboWarp's `getSpriteTargetByName` finds it: the first target that
 * is not the stage, so the original, which comes before its clones. Anything else is undefined.
 */
function spriteNamed(rt: Runtime, name: Value): Target | undefined {
  const s = ops.toStr(name);
  return rt.targets.find((x) => !x.isStage && x.name === s);
}

/**
 * Where a "go to" or "glide to" menu value, known only at run time, points: the mouse pointer, a
 * random position, a sprite, or undefined for a name that is none of these.
 */
function placeOf(rt: Runtime, to: Value): [number, number] | undefined {
  if (to === "_mouse_") return [rt.mouse.x, rt.mouse.y];
  if (to === "_random_") return [randomX(), randomY()];
  const s = spriteNamed(rt, to);
  return s && [s.x, s.y];
}

/** "go to" a menu value known only at run time; a name that is no sprite does nothing. */
export function goTo(rt: Runtime, t: Target, to: Value): void {
  const p = placeOf(rt, to);
  if (p) setXY(rt, t, p[0], p[1]);
}

/** "go to random position", the menu fixed at compile time. */
export function goToRandom(rt: Runtime, t: Target): void {
  setXY(rt, t, randomX(), randomY());
}

/** "glide to" a menu value known only at run time; the place is fixed when the glide starts. */
export function* glideTo(rt: Runtime, t: Target, seconds: number, to: Value): Generator<unknown, void, unknown> {
  const p = placeOf(rt, to);
  if (p) yield* glide(rt, t, seconds, p[0], p[1]);
}

/** "glide to random position", the menu fixed at compile time. */
export function* glideToRandom(rt: Runtime, t: Target, seconds: number): Generator<unknown, void, unknown> {
  yield* glide(rt, t, seconds, randomX(), randomY());
}

/** Points at (x, y); the same as TurboWarp, which turns the angle `atan2` gives. */
export function pointAt(rt: Runtime, t: Target, x: number, y: number): void {
  setDirection(rt, t, 90 - (Math.atan2(y - t.y, x - t.x) * 180) / Math.PI);
}

/** "point towards" a menu value known only at run time. A random direction is a whole number. */
export function pointTowards(rt: Runtime, t: Target, to: Value): void {
  if (to === "_mouse_") return pointAt(rt, t, rt.mouse.x, rt.mouse.y);
  if (to === "_random_") return setDirection(rt, t, Math.round(Math.random() * 360) - 180);
  const s = spriteNamed(rt, to);
  if (s) pointAt(rt, t, s.x, s.y);
}

export function setDirection(rt: Runtime, t: Target, dir: number): void {
  if (!Number.isFinite(dir)) return;
  // TurboWarp's `wrapClamp(dir, -179, 180)`; written this way it rounds the same for fractions.
  t.direction = dir - Math.floor((dir + 179) / 360) * 360;
  if (t.visible) rt.requestRedraw();
}

export function* glide(rt: Runtime, t: Target, seconds: number, x: number, y: number): Generator<unknown, void, unknown> {
  const start = rt.liveNow();
  const duration = seconds * 1000;
  const x0 = t.x;
  const y0 = t.y;
  if (duration > 0) {
    // Like TurboWarp, the first step only starts the glide: no move, so no redraw yet.
    yield WAIT;
    for (;;) {
      const now = rt.liveNow();
      const frac = (now - start) / duration;
      if (frac >= 1) break;
      setXY(rt, t, x0 + (x - x0) * frac, y0 + (y - y0) * frac);
      yield WAIT;
      // The virtual clock stands still within a frame, so until the next frame each step would
      // only set the same position again.
      if (rt.options.clock === "virtual") while (rt.liveNow() === now) yield SLEEP;
    }
  }
  setXY(rt, t, x, y);
}

export function bounce(rt: Runtime, t: Target): void {
  // Approximation: treats the sprite as a point. Real bounds need the renderer.
  let dir = t.direction;
  if (t.x > 240 || t.x < -240) dir = -dir;
  if (t.y > 180 || t.y < -180) dir = 180 - dir;
  setXY(rt, t, Math.max(-240, Math.min(240, t.x)), Math.max(-180, Math.min(180, t.y)));
  setDirection(rt, t, dir);
}

/** Scratch hides floating-point noise in x/y reporters. */
export function coord(n: number): number {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? r : n;
}

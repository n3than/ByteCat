import type { Runtime } from "./runtime.js";
import { STOP_ALL, WAIT, type Thread } from "./thread.js";

/** At most this many passes run after a thread starts before the scheduler reads the clock. */
const START_CHECK = 4;

/**
 * The most passes over the threads between two reads of the clock. A light interval can turn
 * heavy without warning, so this bounds how far a frame can overrun its budget.
 */
const MAX_STRIDE = 128;

/**
 * The most loop iterations a thread running alone completes between two reads of the clock
 * (`spinLimit`). Smaller than MAX_STRIDE: a lone loop reaches its limit far more often than the
 * stride reaches its own, and 32 already makes the scheduler's share of a cheap loop small.
 */
const MAX_SPIN = 32;

/**
 * A read of the scheduler clock this long after the previous one marks the interval as heavy, and
 * `tick` sends the stride and the spin limit back to their floor. `tick` writes it as a literal so
 * its hot loop is unchanged by the lockstep hooks below; `passClock` depends on the two agreeing
 * (tests/trace.test.ts checks that a frame runs exactly the pass budget).
 */
const HEAVY_INTERVAL = 0.25;

/** How long `tick` keeps stepping threads, in milliseconds: 75% of a frame, as in Scratch. */
export function frameBudget(fps: number): number {
  return (1000 / fps) * 0.75;
}

/**
 * A scheduler clock for lockstep runs (the trace oracle, docs/testing.md). With it, and with the
 * runtime's `spin` pinned to 0, a frame ends after exactly `passes` passes over the threads (sooner
 * on a redraw or when every thread is blocked), whatever the machine. Each read moves it on by
 * HEAVY_INTERVAL, so `tick` keeps reading it after every pass, and the read after the last allowed
 * pass is past any budget. Call `reset()` before each tick. Every earlier read must stay inside
 * the budget, so `passes` is at most ceil(frameBudget(fps) / 0.25) (100 at 30 fps, 50 at 60).
 */
export function passClock(passes: number, fps = 30): { read: () => number; reset: () => void } {
  if (!(Number.isInteger(passes) && passes >= 1 && (passes - 1) * HEAVY_INTERVAL < frameBudget(fps))) {
    const max = Math.ceil(frameBudget(fps) / HEAVY_INTERVAL);
    throw new RangeError(`passes must be an integer from 1 to ${max} at ${fps} fps, got ${passes}`);
  }
  let reads = 0;
  return {
    read: () => {
      const k = reads++;
      return k < passes ? k * HEAVY_INTERVAL : Infinity;
    },
    reset: () => {
      reads = 0;
    },
  };
}

/**
 * Runs one frame. Like Scratch, it keeps cycling through threads until most of the frame budget
 * is used, a redraw is requested (outside turbo mode), or every thread is blocked.
 *
 * A loop outside warp mode yields at the end of every iteration, which costs a trip through
 * this scheduler. That is pointless for a thread running alone, since the next pass would step
 * the same thread again. So a lone thread is allowed to complete `spinLimit` iterations per
 * step without yielding (`spin`). With two or more threads (even finished ones not yet
 * removed) `spin` is 0 and every iteration yields, so threads interleave as before.
 */
export function tick(rt: Runtime): void {
  const budget = (1000 / rt.options.fps) * 0.75;
  const clock = rt.schedulerClock;
  const frameStart = clock();
  let lastCheck = frameStart;
  // Reading the clock costs about as much as a pass of one short thread, so it is read every
  // `stride` passes: doubling (up to MAX_STRIDE) while a stride takes under 0.25 ms, and back to 1
  // as soon as one takes longer. The clock's resolution is too coarse to size it from one pass.
  // `spinLimit`, how many loop iterations a thread running alone may skip yielding for per step,
  // grows the same way while that thread runs alone, and then the clock is read after every
  // pass (stride 1), so at most MAX_SPIN iterations run between two reads. Like
  // `stride` it starts at 1 each frame and drops back to 1 when the set of threads changes,
  // since the cost of a pass no longer says what the next one costs.
  let spinLimit = 1;
  let stride = 1;
  let untilCheck = 1;
  rt.redraw = false;
  for (;;) {
    let progressed = false;
    let finished = false;
    const count = rt.threads.length;
    // Threads started during this pass run in the same pass, as in Scratch.
    for (let i = 0; i < rt.threads.length; i++) {
      const th = rt.threads[i]!;
      if (th.done) {
        finished = true;
        continue;
      }
      rt.spin = rt.threads.length === 1 ? spinLimit : 0;
      if (step(rt, th) !== WAIT) progressed = true;
      if (th.done) finished = true;
    }
    // A new thread can make passes much heavier, so read the clock within a few passes of one
    // starting. Not on the very next pass: projects that start threads all the time (every
    // broadcast and wait does) would then read it on nearly every pass.
    if (rt.threads.length !== count && untilCheck > START_CHECK) untilCheck = START_CHECK;
    if (finished || rt.threads.length !== count) spinLimit = 1;
    if (finished) rt.threads = rt.threads.filter((th) => !th.done);
    if (!progressed || rt.threads.length === 0) break;
    if (rt.redraw && !rt.options.turbo) break;
    if (--untilCheck === 0) {
      const now = clock();
      if (now - frameStart >= budget) break;
      if (now - lastCheck >= 0.25) {
        stride = 1;
        spinLimit = 1;
      } else if (rt.threads.length === 1) {
        stride = 1;
        spinLimit = Math.min(spinLimit * 2, MAX_SPIN);
      } else {
        stride = Math.min(stride * 2, MAX_STRIDE);
      }
      untilCheck = stride;
      lastCheck = now;
    }
  }
  rt.frame++;
}

/** Advances one thread to its next yield. `stop all` arrives as the `STOP_ALL` exception. */
export function step(rt: Runtime, th: Thread): unknown {
  try {
    const r = th.gen.next();
    if (r.done) th.done = true;
    return r.value;
  } catch (e) {
    th.done = true;
    if (e === STOP_ALL) rt.stopAll();
    else throw e;
    return undefined;
  }
}

import type { Runtime } from "./runtime.js";
import { BLOCKED, RETIRE, SLEEP, STOP_ALL, type Thread } from "./thread.js";

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
 * on a redraw or when no thread can go on), whatever the machine. Each read moves it on by
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
 * Runs one frame. Like TurboWarp's sequencer (`stepThreads`), it keeps cycling through threads
 * until most of the frame budget is used, a redraw is requested (outside turbo mode), or no thread
 * can go on: a pass in which every step yielded `BLOCKED` or ended its thread. A thread that
 * yields `WAIT` can go on, since TurboWarp's compiled waits keep their thread running: the frame
 * goes on and the wait is checked again on the next pass, so it sees what other threads did. A
 * pass in which every step yielded `SLEEP` or `BLOCKED` also ends the frame, since no later pass
 * could change anything (see `SLEEP` in thread.ts).
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
  rt.startFrame();
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
    // Whether a step yielded `undefined` or `WAIT`, and whether one yielded `SLEEP`.
    let progressed = false;
    let sleeping = false;
    let finished = false;
    // Threads started during this pass run in the same pass, as in Scratch. A `stop all` gives
    // `rt` a new list, and this pass still goes through the old one (see `stopAll`).
    const threads = rt.threads;
    const count = threads.length;
    for (let i = 0; i < threads.length; i++) {
      const th = threads[i]!;
      if (th.done) {
        finished = true;
        continue;
      }
      rt.spin = threads.length === 1 ? spinLimit : 0;
      const r = step(rt, th);
      if (r !== BLOCKED) {
        if (r === SLEEP) sleeping = true;
        else progressed = true;
      }
      if (th.done) finished = true;
    }
    // A new thread can make passes much heavier, so read the clock within a few passes of one
    // starting. Not on the very next pass: projects that start threads all the time (every
    // broadcast and wait does) would then read it on nearly every pass.
    if (rt.threads.length !== count && untilCheck > START_CHECK) untilCheck = START_CHECK;
    if (finished || rt.threads.length !== count) spinLimit = 1;
    if (finished) {
      rt.threads = rt.threads.filter((th) => !th.done);
      rt.doneListed = false;
    }
    // TurboWarp would go on after a pass of SLEEP alone, but nothing could change. A thread that
    // ended (`finished`) may have done work, such as restarting a script behind it, so then it
    // goes on, as TurboWarp does while a thread sleeps.
    if (!(progressed || (sleeping && finished)) || rt.threads.length === 0) break;
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

/**
 * Advances one thread to its next yield and returns what it yielded, or `BLOCKED` when the thread
 * ended: in TurboWarp a thread that is done no longer counts as active, so it does not keep the
 * frame going. `stop all` arrives as the `STOP_ALL` exception, and a clone that deleted itself
 * inside a custom block as `RETIRE`.
 */
export function step(rt: Runtime, th: Thread): unknown {
  try {
    const r = th.gen.next();
    if (!r.done) return r.value;
    th.done = true;
    rt.doneListed = true;
    return BLOCKED;
  } catch (e) {
    th.done = true;
    rt.doneListed = true;
    if (e === RETIRE) return BLOCKED;
    if (e !== STOP_ALL) throw e;
    return stopAll(rt, th);
  }
}

/**
 * `stop all` from thread `th`, as TurboWarp does it. Its `runtime.stopAll()` stops `th` and
 * replaces the thread list with an empty one, but `stepThreads` goes on through the list it was
 * stepping, so each thread after `th` that was still running gets one more step in this pass.
 * Those threads are no longer listed (`done` here), so `broadcast and wait` sees them as finished,
 * and the threads they start join the new list and first run in the next pass. Returns what
 * `tick` should count for them: `undefined` if one of them yielded `undefined` or `WAIT`, else
 * `SLEEP` if one yielded that, else `BLOCKED`.
 */
function stopAll(rt: Runtime, th: Thread): unknown {
  const i = rt.threads.indexOf(th);
  // `tick` only steps listed threads; one stepped from anywhere else has nothing after it. The
  // threads of clones get no step: TurboWarp's `stopAll` disposes the clones first, which stops
  // their threads (`stopForTarget`).
  const rest = i < 0 ? [] : rt.threads.slice(i + 1).filter((t) => !t.done && t.target.isOriginal);
  rt.stopAll();
  let result: unknown = BLOCKED;
  for (const t of rest) {
    rt.spin = 0;
    try {
      const r = t.gen.next();
      if (r.done || r.value === BLOCKED) continue;
      if (r.value !== SLEEP) result = undefined;
      else if (result === BLOCKED) result = SLEEP;
    } catch (e) {
      if (e === RETIRE) continue;
      if (e !== STOP_ALL) throw e;
      rt.stopAll();
    }
  }
  return result;
}

// The deterministic environment a lockstep frame runs in. While a frame runs, the globals that make
// a run depend on the machine are swapped for virtual ones and put back afterwards:
//
// - Math.random draws from a seeded generator (`pick random`, list index "random").
// - Date.now is a pinned date plus the virtual time (`days since 2000`, TurboWarp's default Timer).
// - setTimeout and clearTimeout schedule on the virtual clock (TurboWarp's `say for secs`).
//
// Both engines step synchronously, so nothing else runs while the globals are swapped. The file has
// no Node imports, so a browser-side driver can use it too.

/** mulberry32, the generator the fuzzer uses: small, fast and the same on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Timers on the virtual clock. A timer fires once `elapsed >= delay`, at a frame boundary. */
export class VirtualTimers {
  private nextId = 1;
  private readonly pending = new Map<number, { start: number; delay: number; fn: () => void }>();

  constructor(private readonly now: () => number) {}

  setTimeout(fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): number {
    // Node's rule: anything that is not a number from 1 to 2^31 - 1 waits 1 ms.
    let ms = Number(delay);
    if (!(ms >= 1 && ms <= 2147483647)) ms = 1;
    const id = this.nextId++;
    this.pending.set(id, { start: this.now(), delay: ms, fn: () => fn(...args) });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.pending.delete(id as number);
  }

  /** Runs every timer that is due at the current virtual time, in the order they were set. */
  fireDue(): number {
    let fired = 0;
    const now = this.now();
    for (const [id, t] of this.pending) {
      if (now - t.start >= t.delay) {
        this.pending.delete(id);
        t.fn();
        fired++;
      }
    }
    return fired;
  }
}

export interface VirtualGlobals {
  random: () => number;
  /** Milliseconds since the epoch for Date.now. */
  date: () => number;
  /** Timers for setTimeout and clearTimeout. Left alone when absent. */
  timers?: VirtualTimers;
}

/** Runs `fn` with Math.random, Date.now (and the timers, if given) swapped for virtual ones. */
export function withVirtualGlobals<T>(env: VirtualGlobals, fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const random = Math.random;
  const now = Date.now;
  const setTimeout = g.setTimeout;
  const clearTimeout = g.clearTimeout;
  Math.random = env.random;
  Date.now = env.date;
  if (env.timers) {
    const timers = env.timers;
    g.setTimeout = timers.setTimeout.bind(timers);
    g.clearTimeout = timers.clearTimeout.bind(timers);
  }
  try {
    return fn();
  } finally {
    Math.random = random;
    Date.now = now;
    g.setTimeout = setTimeout;
    g.clearTimeout = clearTimeout;
  }
}

/** Lets promise callbacks (an answered `ask`, a finished `say for secs`) run before the next frame. */
export function flushPromises(): Promise<void> {
  const later = (globalThis as { setImmediate?: (fn: () => void) => void }).setImmediate ?? ((fn) => setTimeout(fn, 0));
  return new Promise((resolve) => later(resolve));
}

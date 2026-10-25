# Benchmarks

`@bytecat/bench` runs a Scratch project on several engines, checks that each one produces the
expected `log` output, and times it.

```sh
pnpm bench                                   # every bench/*.sbp on bytecat and scratch-vm, 1 warmup + 5 timed runs
pnpm bench arith sieve                       # only these benchmarks
pnpm bench --engines bytecat --runs 10       # choose engines, timed runs and warmup runs (--warmup)
pnpm bench --json -o out/bench.json          # raw results; -o writes them to a file as JSON
```

The command prints a Markdown table (median milliseconds per engine and the speedup over
scratch-vm) and each engine's compile time. It exits with code 1 if any engine produced a wrong
log or did not finish, and prints the reason.

## The benchmarks

Each program lives in `bench/NAME.sbp` with its expected output in `bench/NAME.expected`, and
takes roughly 0.3 to 1.5 seconds in scratch-vm.

| Name | What it stresses |
| --- | --- |
| `arith` | A tight arithmetic loop (multiply, add, modulo) inside a `define warp` procedure. |
| `recursion` | Naive recursive Fibonacci inside a warp procedure, with a list as the call stack. Procedure calls and list push/pop. |
| `sieve` | Sieve of Eratosthenes over a 150000 item list (kept under scratch-vm's 200000 item list cap). List reads and writes in nested loops. |
| `strings` | Building a 100000 character string with `join` and `letter`, then scanning it. String concatenation and indexing. |
| `yield_loop` | A plain `repeat` in a `when flag` script, not in warp mode, so it yields every iteration. Scheduler overhead. |
| `pingpong` | Two sprites exchanging `broadcast_wait` messages 400000 times. Event dispatch and thread start/wait. |

## How timing works

- Every engine runs in turbo mode, headless, and is timed from the green flag until the last
  script stops. Loading the project is not included.
- Each engine gets `warmup` untimed runs (default 1) so the JIT is warm, then `runs` timed runs
  (default 5). The table shows the median.
- Bytecat's compile time (project.json to JavaScript) is measured separately and not included in
  the run time. It is printed under the table. Parsing the pseudocode is not timed for any engine.
- Every run, including warmup, is checked against `bench/NAME.expected`. A wrong log or a run
  that does not finish within the timeout marks the result `FAIL`.

## Caveats

- The Bytecat headless runtime runs frames back to back on a virtual clock. scratch-vm runs its
  loop on its own 60 Hz interval. Benchmarks that yield on every iteration (`yield_loop`, and
  `pingpong` to a degree) therefore partly measure that pacing difference, not only block speed.
  The warp benchmarks are the cleanest comparison.
- Numbers vary by machine and load. Compare ratios on the same machine, not absolute times.
- Bytecat follows TurboWarp and has no list length limit. scratch-vm caps lists at 200000 items,
  so keep benchmark lists below that or the engines will disagree.

## Adding a benchmark

1. Write `bench/NAME.sbp` in pseudocode (see [pseudocode.md](pseudocode.md)). Keep the output small
   and deterministic: no `random()`, `timer()` or input, and every script must stop.
2. Run `pnpm bytecat run bench/NAME.sbp --engine reference`, check the output is what Scratch
   should print, and save it as `bench/NAME.expected` (one `log()` item per line).
3. Tune the loop counts until it takes about 0.3 to 2 seconds in scratch-vm (`pnpm bench NAME`).

`tests/bench.test.ts` runs every benchmark once on both engines inside `pnpm test`, so a missing
or wrong `.expected` file fails `pnpm verify`.

## Adding an engine

An engine implements `Engine` from `@bytecat/bench`: a `name`, a `description`, and
`run(project, { timeoutMs })`, which returns `{ log, finished, runMs, compileMs? }`. Register it
before the CLI looks up engines:

```ts
import { registerEngine } from "@bytecat/bench";

registerEngine({ name: "turbowarp", description: "...", async run(project, { timeoutMs }) { ... } });
```

It can then be selected with `pnpm bench --engines bytecat,scratch-vm,turbowarp`. Engines should run in turbo
mode and time from the green flag to the last script stopping, like the built-in ones. TurboWarp is
being added separately.

## Sample results

A sample from one machine (Linux, Node 22), 2026-10-25, `pnpm bench --runs 3` (1 warmup run).
Treat it as an illustration, not a reference.

```
| benchmark | bytecat (ms) | scratch-vm (ms) | bytecat speedup |
| --- | --- | --- | --- |
| arith | 14.8 | 860.0 | 58.1x |
| pingpong | 191.0 | 1002.6 | 5.2x |
| recursion | 68.7 | 1088.2 | 15.8x |
| sieve | 28.4 | 822.8 | 29.0x |
| strings | 33.5 | 428.3 | 12.8x |
| yield_loop | 186.7 | 903.3 | 4.8x |

Compile time (not included above): arith 0.4 ms, pingpong 0.2 ms, recursion 0.3 ms, sieve 0.5 ms, strings 0.4 ms, yield_loop 0.2 ms
```

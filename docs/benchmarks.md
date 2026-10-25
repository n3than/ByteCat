# Benchmarks

`@bytecat/bench` runs a Scratch project on several engines, checks that each one produces the
expected `log` output, and times it.

```sh
pnpm bench                                   # every bench/*.sbp on every engine, 1 warmup + 5 timed runs
pnpm bench arith sieve                       # only these benchmarks
pnpm bench --engines bytecat --runs 10       # choose engines, timed runs and warmup runs (--warmup)
pnpm bench --baseline scratch-vm             # speedup columns relative to scratch-vm instead of TurboWarp
pnpm bench --json -o out/bench.json          # raw results; -o writes them to a file as JSON
```

The command prints a Markdown table (median milliseconds per engine and the speedup over the
baseline engine: `--baseline` if given, otherwise TurboWarp, then scratch-vm, when selected,
otherwise the first selected engine other than bytecat) and each engine's compile time. It exits with code 1 if any engine produced a wrong
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
- TurboWarp runs with its compiler on and no warp timer. A script it cannot compile marks the
  result `FAIL`, so its timings always measure compiled code. Blocks that TurboWarp runs through
  its compatibility layer (calls back into interpreter block functions) still count as compiled,
  so benchmarks heavy in those blocks are not pure compiled-code timings for TurboWarp.
- `pingpong` is about 2x slower on TurboWarp than on scratch-vm. The cause is not known yet: both
  wait a tick per `broadcast_wait`, so it may be TurboWarp's compiled `broadcast_wait` path or its
  per-tick overhead. The Bytecat runtime keeps stepping threads within the same frame, which is
  why it is faster than both here.
- Numbers vary by machine and load. Compare ratios on the same machine, not absolute times.
- Bytecat follows TurboWarp and has no list length limit. scratch-vm caps lists at 200000 items,
  so keep benchmark lists below that or the engines will disagree.

## Adding a benchmark

1. Write `bench/NAME.sbp` in pseudocode (see [pseudocode.md](pseudocode.md)). Keep the output small
   and deterministic: no `random()`, `timer()` or input, and every script must stop.
2. Run `pnpm bytecat run bench/NAME.sbp --engine reference`, check the output is what Scratch
   should print, and save it as `bench/NAME.expected` (one `log()` item per line).
3. Tune the loop counts until it takes about 0.3 to 2 seconds in scratch-vm (`pnpm bench NAME`).

`tests/bench.test.ts` runs every benchmark once on every registered engine inside `pnpm test`, so a missing
or wrong `.expected` file fails `pnpm verify`.

## Adding an engine

An engine implements `Engine` from `@bytecat/bench`: a `name`, a `description`, and
`run(project, { timeoutMs })`, which returns `{ log, finished, runMs, compileMs?, error? }`. Add it
to the registry in `packages/bench/src/engines.ts` (or call `registerEngine`) and both `pnpm bench`
and `tests/bench.test.ts` pick it up. Engines should run in turbo mode and time from the green flag
to the last script stopping, like the built-in `bytecat`, `scratch-vm` and `turbowarp`.

## Sample results

A sample from one machine (Linux, Node 22), 2026-10-25, `pnpm bench --runs 3`
(1 warmup run). Speedups are relative to TurboWarp, so below 1.0x means TurboWarp was faster.
Treat it as an illustration, not a reference: Bytecat's `recursion` time varied between 62 and
116 ms across runs on the same machine.

```
| benchmark | bytecat (ms) | scratch-vm (ms) | turbowarp (ms) | bytecat speedup | scratch-vm speedup |
| --- | --- | --- | --- | --- | --- |
| arith | 11.2 | 835.6 | 41.4 | 3.7x | 0.050x |
| pingpong | 215.2 | 993.6 | 1947.2 | 9.0x | 2.0x |
| recursion | 115.5 | 1197.0 | 40.8 | 0.35x | 0.034x |
| sieve | 42.3 | 792.0 | 52.3 | 1.2x | 0.066x |
| strings | 35.4 | 407.7 | 44.1 | 1.2x | 0.11x |
| yield_loop | 203.9 | 821.7 | 269.6 | 1.3x | 0.33x |
```

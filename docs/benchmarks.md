# Benchmarks

`@bytecat/bench` runs a Scratch project on several engines, checks that each one produces the
expected `log` output, and times it.

```sh
pnpm bench                                   # every bench/*.sbp on every engine, 1 warmup + 5 timed runs
pnpm bench arith sieve                       # only these benchmarks
pnpm bench --engines bytecat --runs 10       # choose engines, timed runs and warmup runs (--warmup)
pnpm bench --runs-bytecat 40 --warmup-bytecat 10  # more runs for Bytecat only: its runs take a few ms
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
| `yield_loop` | A plain `repeat` in a `when flag` script, not in warp mode, so every iteration ends in a loop yield. TurboWarp and scratch-vm go through their scheduler each time; Bytecat skips the yield while a thread runs alone (`rt.spin`, see [architecture.md](architecture.md#scheduler)). Scheduler overhead. |
| `clones` | A spawner makes 10 clones per frame for 3000 frames; each clone runs a 20 step loop over its own variables (a loop yield per step) and deletes itself, with about 200 clones alive at once. Clone creation, clone threads and deletion. |
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
  `pingpong` to a degree; Bytecat skips the yield of a lone thread, so `yield_loop` hardly measures its scheduler) therefore partly measure that pacing difference, not only block speed.
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

## Comparing a branch with main

The `bench` job in `.github/workflows/ci.yml` runs on every pull request and posts the
comparison as a PR comment (one comment, updated on every push). It checks out the PR head and
its base commit into two directories, installs both, and times both, interleaved (base, head,
base, head, ...) so that a runner that gets faster or slower part-way through affects both sides.

**Why rounds.** Bytecat's benchmarks take 2 to 10 ms, and their timings vary by 25% and more from
one process to the next (JIT and GC decisions, not machine load), however many runs one process
times: measured on one machine, six processes of `sieve` with 40 timed runs each gave medians from
2.7 to 4.4 ms. More runs per process only steady the number inside that process. So the job
runs many separate processes ("rounds") and compares across them:

- Bytecat: 10 rounds per side, each a fresh `pnpm bench --engines bytecat --runs 40 --warmup 10`
  (about 8 s a round). Engines run in separate processes so TurboWarp's garbage does not slow
  Bytecat. (`--runs-bytecat N` and `--warmup-bytecat N` give the same per-engine counts when all
  engines run in one command.)
- TurboWarp: 2 rounds per side at the default runs, after rounds 5 and 10. It is the noise
  reference, since the PR cannot change it, and takes about 15 s a round.
- scratch-vm is left out because it is slow and CI does not depend on it.

The job takes about 4 minutes of benchmarking plus install.

`scripts/bench-compare.ts` (tested in `tests/bench-compare.test.ts`) reads the round files and
writes the comment. For each benchmark and engine it shows the median over the rounds on each
side, the change, and the spread of the rounds on each side (Q1 to Q3). The rule for the flag:

> A Bytecat row is flagged when its head median is more than 10% slower than the base median
> **and** the head's Q1 is slower than the base's Q3, that is, the middle halves of the two sets of
> rounds do not overlap.

A difference over 10% that fails the second condition is shown as "(within noise)" and not
flagged. The rule is deliberately conservative. Resampling 20 rounds measured on one machine into
two sets of 10 (500 times, every benchmark): identical code was flagged on 0.3% of rows (about
one pull request in 50), a 15% slowdown (injected into the head's rounds) on 65% of rows and a
30% slowdown on 99%. So a flag means a real slowdown; a smaller one can still pass as noise,
which is why the table shows the spread.

Other engines are never flagged. Benchmarks that only one side has are listed apart, and a
result that was wrong or did not finish shows as `FAIL`; a Bytecat failure on either side is also
named in the comment's headline, ahead of any slowdown.

The job reports and never fails the build (`continue-on-error`, and the script exits 0
whatever it finds), because shared runners are noisy. Treat a flag as a reason to re-run and look,
then follow the rule in [roadmap.md](roadmap.md): a real slowdown needs a stated reason in the PR.
On a pull request from a fork the token cannot comment; the same table is then in the job summary.
To compare by hand, run `pnpm bench --engines bytecat --runs 40 --warmup 10 --json -o out/SIDE-N.json`
repeatedly on both commits (alternating) and pass the files to
`pnpm exec tsx scripts/bench-compare.ts --base a1.json,a2.json,... --head b1.json,b2.json,...`.

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
Treat it as an illustration, not a reference: timings on this machine moved by up to 2x between
runs, most for Bytecat when scratch-vm ran in the same process (`--engines bytecat,turbowarp` is
steadier).

```
| benchmark | bytecat (ms) | scratch-vm (ms) | turbowarp (ms) | bytecat speedup | scratch-vm speedup |
| --- | --- | --- | --- | --- | --- |
| arith | 19.1 | 926.0 | 41.4 | 2.2x | 0.045x |
| clones | 59.9 | 1375.0 | 770.2 | 12.9x | 0.56x |
| pingpong | 118.3 | 1070.7 | 1978.5 | 16.7x | 1.8x |
| recursion | 35.4 | 1200.6 | 41.0 | 1.2x | 0.034x |
| sieve | 27.0 | 904.6 | 54.0 | 2.0x | 0.060x |
| strings | 16.6 | 604.9 | 44.6 | 2.7x | 0.074x |
| yield_loop | 56.9 | 868.9 | 207.4 | 3.6x | 0.24x |
```

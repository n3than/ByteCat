# Bytecat

An ultra-fast, deliberately non-spec-compliant Scratch to JavaScript transpiler.
The proof of concept is done: it compiles Scratch projects to standalone JavaScript that runs on a
browser canvas and beats TurboWarp on every benchmark. The current goal is a production-ready web
app for professional block-based applications.

See [docs/roadmap.md](docs/roadmap.md) for the plan and [docs/architecture.md](docs/architecture.md)
for how the pieces fit together.

## Quick start

Requires Node 22+ and pnpm 10.

The easiest way in is the web app: run `pnpm web` and open `out/web/index.html`. Drop an `.sb3`
on it or write pseudocode, press Run, and download a standalone player. See [docs/web.md](docs/web.md).

```sh
pnpm install
pnpm exec playwright install chromium  # once: the browser tests render every example in Chromium
pnpm verify                            # typecheck, then unit tests + every example in scratch-vm, TurboWarp, the Bytecat runtime and a browser
pnpm bytecat run examples/primes.sbp   # compile pseudocode and run it on the Bytecat runtime (--engine reference for scratch-vm, turbowarp for TurboWarp)
pnpm bytecat compile examples/primes.sbp -o out/primes.js  # compile to a JS module
pnpm bytecat bundle examples/render.sbp  # write out/render.html: a standalone page that plays the project
pnpm web                               # write out/web/index.html: the web app (open .sb3 or pseudocode, run, download)
pnpm bench                             # time every bench/*.sbp on Bytecat, scratch-vm and TurboWarp, see docs/benchmarks.md
pnpm bytecat compare game.sb3  # the relaxed check: Bytecat against TurboWarp at checkpoints, with tolerances (also a folder)
pnpm bytecat trace examples/paced_move.sbp  # run on Bytecat and TurboWarp in lockstep and compare every frame, see docs/testing.md
pnpm bytecat trace tests/oracle/bounce.sbp --browser  # the same in Chromium, with TurboWarp's renderer
pnpm bytecat build examples/primes.sbp # write examples/primes.sb3, open it in TurboWarp or Scratch
```

Test projects are written in Bytecat pseudocode, documented in [docs/pseudocode.md](docs/pseudocode.md).

## Status

| Stage | Package | State |
| --- | --- | --- |
| Pseudocode to sb3 | `@bytecat/pseudo` | working |
| sb3 types, read/write | `@bytecat/sb3` | working |
| Reference runner (scratch-vm, TurboWarp) | `@bytecat/reference` | working |
| CLI | `@bytecat/cli` | working |
| sb3 to JavaScript | `@bytecat/compiler` | working (headless) |
| Runtime | `@bytecat/runtime` | working (headless) |
| Canvas renderer, input, standalone HTML | `@bytecat/player` | working |
| Benchmarks | `@bytecat/bench` | working (Bytecat vs scratch-vm and TurboWarp) |
| Web app | `@bytecat/web` | working (single page, runs fully in the browser) |

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **verify**: `pnpm install --frozen-lockfile`, then `pnpm verify` (typecheck and all tests,
  including the browser tests in Chromium). Must be green to merge.
- **fuzz**: `pnpm fuzz --count 1000 --seed 100000`, a seed range the fixed seeds in `pnpm verify` do
  not cover. A failing program is uploaded as the `fuzz-failures` artifact.
- **bench** (pull requests only): builds the PR head and its base commit, times both on the same
  runner (10 interleaved rounds of Bytecat, 2 of TurboWarp as a noise reference) and posts one
  comment with the median per benchmark and engine and the spread of the rounds. A Bytecat row is
  flagged only when it is more than 10% slower beyond that spread. It reports and never fails the
  build. See [docs/benchmarks.md](docs/benchmarks.md#comparing-a-branch-with-main).

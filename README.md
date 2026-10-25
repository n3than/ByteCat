# Bytecat

An ultra-fast, deliberately non-spec-compliant Scratch to JavaScript transpiler.
The current goal is a proof of concept: a walking skeleton that compiles simple, Turing-complete
Scratch projects to standalone JavaScript that runs on a browser canvas, and benchmarks them.

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

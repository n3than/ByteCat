# Bytecat

An ultra-fast, deliberately non-spec-compliant Scratch to JavaScript transpiler.
The current goal is a proof of concept: a walking skeleton that compiles simple, Turing-complete
Scratch projects to standalone JavaScript that runs on a browser canvas, and benchmarks them.

See [docs/roadmap.md](docs/roadmap.md) for the plan and [docs/architecture.md](docs/architecture.md)
for how the pieces fit together.

## Quick start

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm test                              # unit tests + every example run in the reference Scratch VM
pnpm bytecat run examples/primes.sbp   # compile pseudocode and run it in scratch-vm
pnpm bytecat build examples/primes.sbp # write examples/primes.sb3, open it in TurboWarp or Scratch
```

Test projects are written in Bytecat pseudocode, documented in [docs/pseudocode.md](docs/pseudocode.md).

## Status

| Stage | Package | State |
| --- | --- | --- |
| Pseudocode to sb3 | `@bytecat/pseudo` | working |
| sb3 types, read/write | `@bytecat/sb3` | working |
| Reference runner (scratch-vm) | `@bytecat/reference` | working |
| CLI | `@bytecat/cli` | working |
| sb3 to JavaScript | `@bytecat/compiler` | planned |
| Browser runtime and canvas | `@bytecat/runtime` | planned |
| Benchmarks | `@bytecat/bench` | planned |

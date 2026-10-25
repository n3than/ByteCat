# Architecture

```
 .sbp text ──@bytecat/pseudo──▶ .sb3 ──@bytecat/compiler──▶ JS ──@bytecat/runtime──▶ canvas (@bytecat/player)
                                  │
                                  └──@bytecat/reference──▶ scratch-vm (ground truth)
```

A pnpm workspace with one package per pipeline stage. Packages export TypeScript source directly
(`"exports": "./src/index.ts"`), so there is no build step during development; `tsx` runs the CLI
and `vitest` runs tests. `pnpm typecheck` runs `tsc -b` over the project references.

| Package | Role | Depends on |
| --- | --- | --- |
| `packages/sb3` | Types for `project.json`, deterministic ids, generated SVG assets, `.sb3` zip read/write. No Scratch semantics. | fflate |
| `packages/pseudo` | Pseudocode compiler: `lexer.ts` (tokens with INDENT/DEDENT) → `parser.ts` (AST in `ast.ts`) → `lower.ts` (Scratch blocks). The builtin block table is `builtins.ts`. | sb3 |
| `packages/reference` | Runs an `.sb3` in the official scratch-vm headlessly and returns the `log` list, say bubbles and final variables. | scratch-vm |
| `packages/compiler` | `project.json` → one JavaScript program (`compile`, `toModule`, `load`). Reports unsupported opcodes as warnings. | runtime (types), sb3 |
| `packages/runtime` | Headless scheduler (virtual or real clock), targets, say bubbles and the Scratch value helpers in `ops.ts` that generated code calls. | sb3 |
| `packages/player` | Browser player: canvas renderer (`renderer.ts`), keyboard and mouse input, a 30 fps frame loop, and a test mode (`?test`: virtual clock, turbo, frames advance only on `step()`, pixel readback and simulated input via `window.bytecat`). `bundle.ts` builds one self-contained HTML file with esbuild. | runtime, sb3, esbuild |
| `packages/bench` | Benchmark harness: `Engine` implementations (Bytecat, scratch-vm, more via `registerEngine`), `benchmark` (warmup, timed runs, output check) and `formatTable`. See [benchmarks.md](benchmarks.md). | compiler, runtime, reference, sb3 |
| `packages/cli` | The `bytecat` command (`pnpm bytecat ...`). Thin glue over the other packages. | all |
| `tests/` | Cross-package tests: every example end to end (scratch-vm, Bytecat runtime, and in Chromium with `.pixels` probes and `.input` scripts, see `browser.test.ts`), and docs staying in sync. | |
| `examples/` | Test projects (`NAME.sbp`), their expected `log` output (`NAME.expected`), and optionally pixel probes (`NAME.pixels`) and scripted input (`NAME.input`). | |
| `bench/` | Benchmark projects (`NAME.sbp`) and their expected `log` output (`NAME.expected`), run by `pnpm bench` and checked by `tests/bench.test.ts`. | |
| `scripts/` | Repo maintenance scripts, such as generating the builtin tables in the docs. | |

Neither the
compiler nor the runtime depends on `pseudo`, so the compiler only ever sees real `.sb3` files, the
same as it would from the Scratch editor.

## Generated code

`compile` emits a single `function (rt)` expression. Given a `Runtime` it returns the list of hats
(event kind plus script function). Each script is a generator function: loops `yield` at the end of
every iteration unless the script is in warp mode, and any blocked state (`wait`, `wait until`,
`ask`) does `yield rt.WAIT`. Custom blocks are generator functions too, called with `yield*`. The
scheduler steps every thread once per frame.

## Design rules

- **Deterministic output.** Same input, same bytes: ids come from a counter and the zip has a
  fixed timestamp. This keeps snapshots and diffs meaningful.
- **scratch-vm is the oracle.** Behaviour is checked by running the same `.sb3` in scratch-vm and
  comparing the `log` list, not by asserting on generated code.
- **Errors point at source.** Every pseudocode error carries file, line and column; the lowering
  step also records a block id → source line map (`bytecat build --map`).

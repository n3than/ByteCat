# Architecture

```
 .sbp text ──@bytecat/pseudo──▶ .sb3 ──@bytecat/compiler──▶ JS ──@bytecat/runtime──▶ canvas
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
| `packages/cli` | The `bytecat` command (`pnpm bytecat ...`). Thin glue over the other packages. | all |
| `tests/` | Cross-package tests: every example end to end, and docs staying in sync. | |
| `examples/` | Test projects (`NAME.sbp`) and their expected `log` output (`NAME.expected`). | |
| `scripts/` | Repo maintenance scripts, such as generating the builtin tables in the docs. | |

Planned: `packages/compiler` (sb3 → JS), `packages/runtime` (browser scheduler and renderer),
`packages/bench` (benchmarks). Each depends on `sb3` and never on `pseudo`, so the compiler only
ever sees real `.sb3` files, the same as it would from the Scratch editor.

## Design rules

- **Deterministic output.** Same input, same bytes: ids come from a counter and the zip has a
  fixed timestamp. This keeps snapshots and diffs meaningful.
- **scratch-vm is the oracle.** Behaviour is checked by running the same `.sb3` in scratch-vm and
  comparing the `log` list, not by asserting on generated code.
- **Errors point at source.** Every pseudocode error carries file, line and column; the lowering
  step also records a block id → source line map (`bytecat build --map`).

# Architecture

```
 .sbp text ──@bytecat/pseudo──▶ .sb3 ──@bytecat/compiler──▶ JS ──@bytecat/runtime──▶ canvas (@bytecat/player)
                                  │                                         (all four run in the browser in @bytecat/web)
                                  │
                                  └──@bytecat/reference──▶ TurboWarp (oracle, compiled), scratch-vm
```

A pnpm workspace with one package per pipeline stage. Packages export TypeScript source directly
(`"exports": "./src/index.ts"`), so there is no build step during development; `tsx` runs the CLI
and `vitest` runs tests. `pnpm typecheck` runs `tsc -b` over the project references.

| Package | Role | Depends on |
| --- | --- | --- |
| `packages/sb3` | Types for `project.json`, deterministic ids, generated SVG assets, `.sb3` zip read/write, and a plain TypeScript `md5` so it runs in the browser. No Scratch semantics. | fflate |
| `packages/pseudo` | Pseudocode compiler: `lexer.ts` (tokens with INDENT/DEDENT) → `parser.ts` (AST in `ast.ts`) → `lower.ts` (Scratch blocks). The builtin block table is `builtins.ts`. | sb3 |
| `packages/reference` | Runs an `.sb3` headlessly in the official scratch-vm or in TurboWarp's fork (compiler on, `engine: "turbowarp"`) and returns the `log` list, say bubbles, final variables, and for TurboWarp the scripts it could not compile and the number of threads it ran compiled (`tests/turbowarp.test.ts` checks that both signals work). | scratch-vm, TurboWarp/scratch-vm (from GitHub, aliased `turbowarp-vm`) |
| `packages/compiler` | `project.json` → one JavaScript program (`compile`, `toModule`, `load`). Reports unsupported opcodes as warnings. Split into small modules, see [Compiler modules](#compiler-modules). | runtime (types), sb3 |
| `packages/runtime` | Headless scheduler (virtual or real clock), targets, say bubbles and the Scratch value helpers in `ops.ts` that generated code calls. | sb3 |
| `packages/player` | Browser player: canvas renderer (`renderer.ts`), keyboard and mouse input, a 30 fps frame loop, and a test mode (`?test`: virtual clock, turbo, frames advance only on `step()`, pixel readback and simulated input via `window.bytecat`). `page.ts` builds the standalone page in Node or the browser; `bundle.ts` (Node) adds the player script, built with esbuild. `Player.dispose()` frees the canvas for another player. | runtime, sb3, esbuild |
| `packages/bench` | Benchmark harness: `Engine` implementations (Bytecat, scratch-vm, more via `registerEngine`), `benchmark` (warmup, timed runs, output check) and `formatTable`. See [benchmarks.md](benchmarks.md). | compiler, runtime, reference, sb3 |
| `packages/web` | The web app (`pnpm web`): one HTML page that opens an `.sb3` or pseudocode, compiles it in the browser, plays it and offers downloads. See [web.md](web.md). | pseudo, sb3, compiler, player, esbuild |
| `packages/cli` | The `bytecat` command (`pnpm bytecat ...`). Thin glue over the other packages. | all |
| `tests/fuzz/` | The differential fuzzer: random pseudocode programs run on Bytecat and TurboWarp and compared (`pnpm fuzz`, see [fuzzing.md](fuzzing.md)). | pseudo, compiler, runtime, reference |
| `tests/` | Cross-package tests: every example end to end (scratch-vm, TurboWarp, Bytecat runtime, and in Chromium with `.pixels` probes and `.input` scripts, see `browser.test.ts`), and docs staying in sync. | |
| `examples/` | Test projects (`NAME.sbp`), their expected `log` output (`NAME.expected`), and optionally pixel probes (`NAME.pixels`) and scripted input (`NAME.input`). | |
| `bench/` | Benchmark projects (`NAME.sbp`) and their expected `log` output (`NAME.expected`), run by `pnpm bench` and checked by `tests/bench.test.ts`. | |
| `scripts/` | Repo maintenance scripts, such as generating the builtin tables in the docs. | |

Neither the
compiler nor the runtime depends on `pseudo`, so the compiler only ever sees real `.sb3` files, the
same as it would from the Scratch editor.

## Compiler modules

`packages/compiler/src` is split so each piece can be tested alone and an optimization touches
one stage:

| File | Role |
| --- | --- |
| `types.ts` | `Ex` (generated expression plus its static type), `Proc`, `CompileResult`, and `Gen`, the interface block handlers use to reach the compiler. |
| `cast.ts` | Pure helpers: literals, `asNum`/`asStr`/`asBool`/`asAny` casts that skip casts that cannot change the value, `indent`. |
| `scope.ts` | `Scope`: variable and list fields → `t.v[id]` / `S.v[id]`, with the stale-id fallback and the startup prelude for unknown ones. |
| `blocks/*.ts` | One file per Scratch category (`motion`, `looks`, `events`, `control`, `sensing`, `data`, `operators`, `procedures`), each exporting handler tables keyed by opcode. A handler is a pure function of a block and a `Gen`; returning `undefined` makes the block unsupported. `blocks/index.ts` merges the tables. |
| `analysis/yields.ts` | Pure question "can this stack yield?": the waiting statements, the loops, the nesting statements and calls to non-sync procedures. A test checks these tables against what every handler actually does, so they cannot drift. |
| `analysis/procedures.ts` | `collectProcedures` (the custom-block table) and `analyzeSync`, which settles which procedures are plain functions rather than generators by repeating `stackYields` until nothing changes. Runs before any code is generated. |
| `target.ts` | `TargetCodegen`: implements `Gen` for one target, dispatches blocks to handlers and compiles procedures and hat scripts. It throws if the code it generates for a procedure disagrees with the analysis. |
| `emit.ts` | `emitProgram`: assembles the final `function (rt)` text. |
| `codegen.ts` | `compileProject`: the driver over all targets. |

To support a new block, add a handler to the right `blocks/` file and a test in
`packages/compiler/test/blocks.test.ts`. `tests/codegen-snapshots.test.ts` pins the generated JS of every example and bench project in `tests/__snapshots__/`: a refactor must leave them untouched, and an intentional codegen change updates them (`pnpm exec vitest run tests/codegen-snapshots.test.ts -u`) so the diff is reviewable. Handlers are tested against a stub `Gen`
(`test/helpers.ts`), so they need no project.

## Generated code

`compile` emits a single `function (rt)` expression. Given a `Runtime` it returns the list of hats
(event kind plus script function). Each script is a generator function: loops `yield` at the end of
every iteration unless the script is in warp mode, and any blocked state (`wait`, `wait until`,
`ask`) does `yield rt.WAIT`. A custom block that can yield (a waiting block, a loop outside warp,
or a call to another custom block that can yield) is a generator called with `yield*`; one that
never yields compiles to a plain function, which is much cheaper to call. A direct recursive call in a non-warp procedure yields before the call (`if (th.warp === 0) yield;`), as scratch-vm and TurboWarp do, so such a procedure is a generator; a warp one stays plain. Calls to a plain
function skip the `th.warp` counter, which is safe because only the yield at the end of a loop
reads it and a plain function contains none; a new runtime helper that reads `th.warp` would have
to make its caller a generator. Comparisons against a
literal are specialized: a text literal makes it a lowercase string comparison, and a numeric
literal is passed as a number. The scheduler steps every thread in turn, repeating within a frame
until most of the frame budget is used; it reads the clock every few hundred microseconds rather
than after every pass, and within a few passes of a thread starting, since a new thread can make
passes much heavier.

The list helpers in `ops.ts` (`itemOf`, `replaceAt`, `deleteOf`, `insertAt`, `indexOf`) have fast
paths for the common case of a number index (inlined floor and range check, no `listIndex`), and
use `pop()` / `shift()` / `push()` / `unshift()` instead of `splice` when the position is the
first or last. Strings and booleans take the general `listIndex` path. `ops.test.ts` compares every
helper to a copy of the slow implementation for every kind of index, so the results must stay
identical.

## Differential fuzzing

`tests/fuzz/` generates random small programs (`generate.ts`), runs each on the Bytecat runtime and
on TurboWarp and compares their `log` lists (`run.ts`, `main.ts`). It exists so that optimizations
in the compiler cannot change program results without a test noticing. `tests/fuzz.test.ts` runs
50 fixed seeds in `pnpm test`; `pnpm fuzz --count N` runs more. See [fuzzing.md](fuzzing.md).

## Design rules

- **Deterministic output.** Same input, same bytes: ids come from a counter and the zip has a
  fixed timestamp. This keeps snapshots and diffs meaningful.
- **TurboWarp is the oracle.** Behaviour is checked by running the same `.sb3` in TurboWarp
  (compiler on, every script must compile) and comparing the `log` list, not by asserting on
  generated code. Every example also runs in scratch-vm as a second check; where scratch-vm
  knowingly differs, its output goes in `NAME.scratch.expected` and the difference is listed in
  [deviations.md](deviations.md).
- **Errors point at source.** Every pseudocode error carries file, line and column; the lowering
  step also records a block id → source line map (`bytecat build --map`).

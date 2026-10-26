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
| `packages/player` | Browser player: canvas renderer (`renderer.ts`), keyboard and mouse input, a 30 fps frame loop, and a test mode (`?test`: virtual clock, turbo unless `&turbo=off`, frames advance only on `step()`, pixel readback and simulated input via `window.bytecat`). `page.ts` builds the standalone page in Node or the browser; `bundle.ts` (Node) adds the player script, built with esbuild. `Player.dispose()` frees the canvas for another player. | runtime, sb3, esbuild |
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
| `analysis/typeset.ts` | The static type lattice: a type is a bit set of runtime kinds (positive or negative integer or fraction, +0, -0, the infinities, NaN, numeric string, other string, boolean), with `castNum` and transfer functions for `+ - * / mod round`. Pure, and tested by sampling values of every kind. |
| `analysis/env.ts` | `TypeEnv`: the whole-program types of variables, list items and procedure parameters, which codegen reads and widens until they stop changing. |
| `target.ts` | `TargetCodegen`: implements `Gen` for one target, dispatches blocks to handlers and compiles procedures and hat scripts. It throws if the code it generates for a procedure disagrees with the analysis. |
| `emit.ts` | `emitProgram`: assembles the final `function (rt)` text. |
| `codegen.ts` | `compileProject`: the driver over all targets. |

To support a new block, add a handler to the right `blocks/` file and a test in
`packages/compiler/test/blocks.test.ts`. `tests/codegen-snapshots.test.ts` pins the generated JS of every example and bench project in `tests/__snapshots__/`: a refactor must leave them untouched, and an intentional codegen change updates them (`pnpm exec vitest run tests/codegen-snapshots.test.ts -u`) so the diff is reviewable. Handlers are tested against a stub `Gen`
(`test/helpers.ts`), so they need no project.

## Generated code

`compile` emits a single `function (rt)` expression. Given a `Runtime` it returns the list of hats
(event kind plus script function). Each script is a generator function: loops end each iteration
with `if (th.warp === 0 && --rt.spin < 0) yield;` (never in warp mode), and any blocked state
(`wait`, `wait until`, `ask`) does `yield rt.WAIT`. A custom block that can yield (a waiting block, a loop outside warp,
or a call to another custom block that can yield) is a generator called with `yield*`; one that
never yields compiles to a plain function, which is much cheaper to call. A direct recursive call in a non-warp procedure yields before the call (`if (th.warp === 0) yield;`), as scratch-vm and TurboWarp do, so such a procedure is a generator; a warp one stays plain. Calls to a plain
function skip the `th.warp` counter, which is safe because only the yield at the end of a loop
reads it and a plain function contains none; a new runtime helper that reads `th.warp` would have
to make its caller a generator.

A literal input that is passed on without a cast (`set`, list items and indexes, procedure
arguments, and so on) is emitted as a JavaScript number when that is invisible, the rule of
TurboWarp's `createConstantInput`: with `n = +s`, the literal `s` becomes the number `n` if `n` is
not NaN, `s` is not blank and `n.toString() === s`. So `1`, `0.5`, `-3`, `1e+21` and `Infinity`
are numbers, and `1.0`, ` 1`, `-0`, `0x10`, `1e3`, the empty string and `abc` stay strings
(`numericConstant` in `cast.ts`). Later reads then skip `toNum`, and `compare` takes its number
path. A literal equal to the name of any costume, backdrop or sound in the project also stays a
string, because the value may reach `switch costume to`, where the text `"2"` picks the costume
named "2" but the number 2 picks costume number 2 (`TargetCodegen.any`; inputs that name a costume
always keep the string). Numbers and strings only show up differently in `switch costume to` and in
"contents of list", which counts a number by its text like TurboWarp (see
[deviations.md](deviations.md)).

Every generated expression carries a static type (`Ex.t`), and a cast is left out only when the
type proves it would return its input unchanged, so leaving it out cannot change behaviour.
Variables, list items and procedure parameters get one type each for the whole program, the union
of everything ever stored in them, starting from the initial values. `compileProject` generates the
code, collects the types stored in this pass, and generates again until they stop growing (or widens
to "anything" after 20 passes). So a counter set to 1 and only ever increased stays a number that
is never NaN: `i > n` becomes a plain JavaScript `>` and `i + 1` needs no `toNum`. Two rules keep
counters precise. Equality with a number that cannot be NaN is `===` when the other side is a
number or a non-numeric string, since NaN and such strings never equal a number either way. And
adding a literal smaller than 2^970 to a finite number cannot overflow, so a counter stepped by a
literal stays finite and `i * i` cannot be `Infinity * 0`, which would be NaN.
`tests/type-inference.test.ts` checks the benchmark hot loops stay free of casts.

Comparisons against a
literal are specialized: a text literal makes it a lowercase string comparison, and a numeric
literal is passed as a number.

## Scheduler

`Runtime.tick` runs one frame. It steps every thread in turn, repeating within a frame until most
of the frame budget is used, a redraw is requested outside turbo mode, or every thread is blocked;
it reads the clock every few hundred microseconds rather than after every pass, and within a few
passes of a thread starting, since a new thread can make passes much heavier.

**Loop yields.** A loop yield hands control back to the scheduler, which for a thread that is
alone would step the same thread again straight away. So `rt.spin` counts how many more loop
iterations the running thread may finish without yielding: the generated check decrements it and
yields once it is below zero. Before each step `tick` sets `spin` to `spinLimit` when there is
exactly one thread in `rt.threads` (finished threads still count until they are removed) and to 0
otherwise, so with two or more threads every iteration yields and they interleave exactly as if
there were no `spin`. Anything that could need the loop to yield sets `spin = 0`, so the thread
yields at the end of its current iteration:

- `start` (a new thread runs in the same pass, as in Scratch), `stopAll` and `stopOthers`;
- `requestRedraw()` outside turbo mode. Every block that changes what is on screen calls it instead
  of setting `redraw`, so a loop that moves a visible sprite still yields every iteration and
  draws once per frame. In turbo mode nothing ends a frame early, so it leaves `spin` alone.

`spinLimit` is local to a `tick`. It starts at 1 each frame, and each time the scheduler reads the
clock while one thread runs alone it doubles, up to 128, if less than 0.25 ms passed since the
previous read, and drops back to 1 otherwise. While a thread spins the clock is read after every
pass, so at most 128 loop iterations run between two reads, the same bound as the clock-read
stride over passes; a loop whose iterations turn heavy is noticed within 128 of them. It also
drops back to 1 whenever a thread starts or finishes, because the cost of the last pass then says
little about the next one. A cheap loop body therefore runs up to 128 iterations per step, and a
heavy one is stepped once per iteration so a frame still ends on time. `packages/runtime/test/scheduler.test.ts` checks this, `examples/interleave`
the thread order, and `examples/paced_move` (see `turbo off` in
[pseudocode.md](pseudocode.md#output-and-testing)) the pacing of a loop that draws.

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

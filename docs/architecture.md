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
| `packages/pseudo` | Pseudocode compiler: `lexer.ts` (tokens with INDENT/DEDENT) → `parser.ts` (AST in `ast.ts`) → `lower.ts` (Scratch blocks). `lower.ts` is the core: project and target scopes, declarations, and the walk over scripts, statements and expressions with block id and source map handling. `lower/` has one file per family, each exporting plain functions that lower into a `TargetBuilder`: `control.ts` (if, loops, `for` desugaring), `data.ts` (assignment, list statements and list reporters), `procedures.ts` (`define` and calls), `events.ts` (`when` hats), `operators.ts` (arithmetic, comparison, `join`) and `calls.ts` (table-driven calls of builtin functions, `log`, and the "did you mean" hints). The builtin block table is `builtins.ts`. `tests/lower-hashes.test.ts` pins a hash of `project.json` and the source map for every example, bench and 300 fuzz seeds, so a refactor of lowering cannot change a block id. | sb3 |
| `packages/reference` | Runs an `.sb3` headlessly in the official scratch-vm or in TurboWarp's fork (compiler on, `engine: "turbowarp"`) and returns the `log` list, say bubbles, final variables, and for TurboWarp the scripts it could not compile and the number of threads it ran compiled (`tests/turbowarp.test.ts` checks that both signals work). `TurboWarpLockstepCore` (`tw-lockstep.ts`, no Node imports) steps TurboWarp one frame at a time on a virtual clock for the trace oracles, and `TurboWarpLockstep` (`lockstep.ts`) loads it in Node; `tw-browser.ts` is the browser entry the browser oracle bundles; `virtual.ts` holds the seeded random, pinned date and virtual timers, and `tw-ids.ts` makes TurboWarp's ids from a counter. `turbowarpBlocks` lists the opcodes and hat rules of TurboWarp's block modules, for the block inventory test. | scratch-vm, TurboWarp/scratch-vm (from GitHub, aliased `turbowarp-vm`) |
| `packages/compiler` | `project.json` → one JavaScript program and the runtime functions it imports (`compileProject`, `toModule`, `toScript`, `load`). Reports unsupported opcodes as warnings. Split into small modules, see [Compiler modules](#compiler-modules). | runtime (types), sb3 |
| `packages/runtime` | Headless scheduler (virtual or real clock), targets, say bubbles and the Scratch value helpers in `ops.ts` that generated code calls. `runtime.ts` is the `Runtime` class (state, events, hat order); `thread.ts` the `Thread`, `Hat` and `WAIT`; `scheduler.ts` the frame loop (`tick`, `step`); `lib/{control,event,looks,motion,sensing}.ts` the block helpers as plain functions taking `(rt, target, ...)`, which generated code imports and calls by name (`move(rt, t, 10)`). Each is a subpath export (`@bytecat/runtime/motion`, `@bytecat/runtime/ops`, ...), and `modules.ts` maps those specifiers to the modules for `load` and the player. | sb3 |
| `packages/player` | Browser player: the renderer interface (`backend.ts`, see [Renderer](#renderer)) with a Canvas 2D backend (`renderer.ts`, the default) and a scratch-render backend (`scratch-render.ts`, export `@bytecat/player/scratch-render`; `scratch-esbuild.ts` has the esbuild setup that bundles Scratch's packages), keyboard and mouse input, a 30 fps frame loop, and a test mode (`?test`: virtual clock, turbo unless `&turbo=off`, frames advance only on `step()`, pixel readback and simulated input via `window.bytecat`). `page.ts` builds the standalone page in Node or the browser. `bundle.ts` (Node) builds its script with esbuild: `programBundle` bundles the player (`start.ts`) with the program as `toModule` writes it, so esbuild resolves the program's imports and ships only the runtime modules, and the functions in them, that it reaches (`bytecat bundle`; `tests/bundle.test.ts` checks a project without motion carries no motion code). `playerBundle` is the full player (`main.ts`), with every runtime module, for pages built where no bundler runs: it runs the program the page holds as `toScript` writes it. `Player.dispose()` frees the canvas for another player. | runtime, sb3, esbuild, turbowarp-render |
| `packages/bench` | Benchmark harness: `Engine` implementations (Bytecat, scratch-vm, more via `registerEngine`), `benchmark` (warmup, timed runs, output check) and `formatTable`. See [benchmarks.md](benchmarks.md). | compiler, runtime, reference, sb3 |
| `packages/web` | The web app (`pnpm web`): one HTML page that opens an `.sb3` or pseudocode, compiles it in the browser, plays it and offers downloads. See [web.md](web.md). | pseudo, sb3, compiler, player, esbuild |
| `packages/cli` | The `bytecat` command (`pnpm bytecat ...`). Thin glue over the other packages. | all |
| `packages/trace` | The trace oracle: runs a project on Bytecat and TurboWarp in lockstep, one frame at a time on a virtual clock, and compares a snapshot of everything visible after every frame (`pnpm bytecat trace`, see [testing.md](testing.md)). The TurboWarp side is `TurboWarpLockstep` in `packages/reference`. `browser/` is the browser oracle: `oracle.ts` (Node) bundles `page.ts` and drives it in Chromium, where TurboWarp runs with its renderer (`pnpm bytecat trace --browser`). | compiler, runtime, reference, player, sb3, playwright |
| `tests/fuzz/` | The differential fuzzer: random pseudocode programs run on Bytecat and TurboWarp and compared (`pnpm fuzz`, see [fuzzing.md](fuzzing.md)). | pseudo, compiler, runtime, reference |
| `tests/` | Cross-package tests: every example end to end (scratch-vm, TurboWarp, Bytecat runtime, and in Chromium with `.pixels` probes and `.input` scripts, see `browser.test.ts`), the block inventory against TurboWarp (`inventory.test.ts`), and docs staying in sync. | |
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
| `types.ts` | `Ex` (generated expression plus its static type), `MenuEx` (a menu value, with the special values marked), `Proc`, `CompileResult`, and `Gen`, the interface block handlers use to reach the compiler, including the shared menu resolver `Gen.menu`. |
| `cast.ts` | Pure helpers: literals, `asNum`/`asStr`/`asBool`/`asAny` casts that skip casts that cannot change the value, `indent`. |
| `scope.ts` | `Scope`: variable and list fields → `t.v[id]` / `S.v[id]`, with the stale-id fallback and the startup prelude for unknown ones. |
| `extensions/*.ts` | Every block category is an extension (see [extensions.md](extensions.md)): one file per id (`motion`, `looks`, `sound`, `event`, `control`, `sensing`, `operator`, `data`, `procedures`, `argument`, `pen`), each declaring every opcode TurboWarp knows in it with its kind, status (compiled, partial, missing), handler, yield behaviour, hat rules and the runtime functions it uses. A handler is a pure function of a block and a `Gen`; returning `undefined` makes the block unsupported. `extensions/api.ts` defines the specs, `extensions/registry.ts` the `ExtensionRegistry` every other stage looks opcodes up in, and `extensions/index.ts` the built-in list. |
| `analysis/yields.ts` | Pure question "can this stack yield?", answered from each statement's `yields` and `substacks` declarations (and, for a custom reporter call in any input, the call's `yields`), the one source of truth. A test runs every handler against a stub and checks it against its declaration, so they cannot drift. |
| `analysis/procedures.ts` | `collectProcedures` (the custom-block table, with which procedures are called as reporters) and `analyzeSync`, which settles which procedures are plain functions rather than generators by repeating `stackYields` until nothing changes. Runs before any code is generated. |
| `analysis/typeset.ts` | The static type lattice: a type is a bit set of runtime kinds (positive or negative integer or fraction, +0, -0, the infinities, NaN, numeric string, other string, boolean), with `castNum` and transfer functions for `+ - * / mod round`. Pure, and tested by sampling values of every kind. |
| `analysis/env.ts` | `TypeEnv`: the whole-program types of variables, list items, procedure parameters and what each procedure returns, which codegen reads and widens until they stop changing. |
| `analysis/effects.ts` | `analyzeEffects`: which variables each procedure (with everything it calls) may read or assign, and whether it may `stop all`. Callers use it to store and reload only the variables a call can see; codegen checks it against every body it compiles. |
| `target.ts` | `TargetCodegen`: implements `Gen` for one target, dispatches blocks to the registry's handlers and compiles procedures and hat scripts (each hat's event and argument come from its spec). It throws if the code it generates for a procedure disagrees with the analysis. |
| `emit.ts` | `emitProgram` assembles the final `function (rt)` text; `programImports` picks its imports (the declared runtime functions the code names, by `referencedNames`); `toModule` and `toScript` write the program with them as an ES module or as a script that takes the modules. |
| `codegen.ts` | `compileProject`: the driver over all targets. It takes extra extensions (`options.extensions`) and reports the project.json extension ids no extension declares (`unknownExtensions`). |

To support a new block, replace its `missing(...)` entry in the right `extensions/` file with a
handler, add a test in `packages/compiler/test/blocks.test.ts` and run `pnpm run docs` to update
[blocks.md](blocks.md) ([extensions.md](extensions.md) has the steps); `tests/inventory.test.ts`
checks the inventory against TurboWarp's block modules. `tests/codegen-snapshots.test.ts` pins the generated JS of every example and bench project in `tests/__snapshots__/`: a refactor must leave them untouched, and an intentional codegen change updates them (`pnpm exec vitest run tests/codegen-snapshots.test.ts -u`) so the diff is reviewable. Handlers are tested against a stub `Gen`
(`test/helpers.ts`), so they need no project.

## Generated code

`compileProject` emits a single `function (rt)` expression and the runtime functions it imports
(`imports`). Given a `Runtime` it returns the list of hats (event kind, the argument it matches,
`restart: false` for a hat that does not restart a running script, and the script function). The
code calls runtime functions as plain functions by name, with the runtime and target as
arguments (`move(rt, t, 10)`), and reads the runtime's state directly (`rt.answer`, `rt.mouse`);
nothing goes through a method on `rt`. `toModule` writes it as the ES module `bytecat compile`
outputs:

```js
// Generated by Bytecat. Do not edit.
import { costumeName, nextCostume, switchCostume } from "@bytecat/runtime/looks";
import { coord, move, setDirection, setXY } from "@bytecat/runtime/motion";

export default function (rt) {
"use strict";
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    setXY(rt, t, 0, 0);
    move(rt, t, 30);
    S.l["list_4"].push(coord(t.x));
...
```

The imports are exactly the runtime functions the code calls (see [extensions.md](extensions.md),
"Runtime functions"); `tests/uses.test.ts` checks that for every example and benchmark. Each
script is a generator function: loops end each iteration with
`if (th.warp === 0 && --rt.spin < 0) yield;` (never in warp mode), and a wait (`wait`,
`wait until`, `glide`, `broadcast and wait`) does `yield WAIT` until it is over. `ask` yields
`BLOCKED` (see [Scheduler](#scheduler)). A custom block that can yield (a waiting block, a loop outside warp,
or a call to another custom block that can yield) is a generator called with `yield*`; one that
never yields compiles to a plain function, which is much cheaper to call. A direct recursive call in a non-warp procedure yields before the call (`if (th.warp === 0) yield;`), as scratch-vm and TurboWarp do, so such a procedure is a generator; a warp one stays plain. Calls to a plain
function skip the `th.warp` counter, which is safe because only the yield at the end of a loop
reads it and a plain function contains none; a new runtime helper that reads `th.warp` would have
to make its caller a generator.

A call in an input is a TurboWarp custom reporter (`procedures_call` declares this expression form
as `reporter` in its spec): it reports what the callee's `return` block (`procedures_return`)
gives, and `""` when the body ends without one, so a procedure that is called this way
(`Proc.reporter`) ends in `return "";` and its `stop this script` returns `""`. A call to a sync
callee is a plain call, `p1_0(t, th, 10)`; any other is `(yield* p1_0(t, th, 10))`, and the yield
analysis looks into every input of a statement, so a statement holding such a call can yield. As
in TurboWarp, a direct recursive call outside warp mode evaluates its arguments, yields, then calls
(`yieldThenCall(th, p1_0(...))`, which works because calling a generator function runs nothing),
and a call to a warp generator runs inside `callInWarp`. A call in an expression stores the
caller's cached variables that the callee can see and reloads the ones it may change, inline:
`v0 + (t.v["x"] = v0, ret = p1_0(t, th), v0 = t.v["x"], ret)`, with one `let ret;` per function
(`Gen.callExpr`; with nothing to store or reload the call stays bare). What a call reports is typed:
each `return` records its value's type, a body that can end without a `return` (`endsInReturn`)
adds the type of `""`, and the code generator repeats until these stop growing, like variable
types, so `fib(n - 1) + fib(n - 2)` adds without casts when every return is a number.

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

Some operators also have a plain JavaScript form that is used only where the types prove it gives
the helper's result for every value of those types (`extensions/operator.ts`, `extensions/data.ts`):
`mod` is `n % m` when the dividend is `+0` or positive (after the number cast, so NaN counts as 0)
and the divisor is positive and finite, so the sign correction never fires; `letter of` is
`s.charAt(i - 1)` and `item of` is `(list[i - 1] ?? "")` when the index is a whole number
from 0 up or Infinity (`WHOLE_INDEX`: `charAt` and a missing item give `""` out of range, including
`list[-1]` for 0, and a list never holds `undefined`; unlike the helper, `letter of` skips the 32-bit cut here, like
TurboWarp's typed path); `replace
item` is `if (i <= list.length) list[i - 1] = v;` for the same index, plus `i > 0 &&` when it may be
0, with a computed index put in a `const` so it is evaluated once and before the item. A test in
`blocks.test.ts` runs each of these forms against its helper for sampled indexes and lists. `letter of` swaps the evaluation order of
index and string, and `replace item` skips the item when the index is out of range, so both keep
the helper when an operand draws a random number or reads a clock (`effectful` in `cast.ts`). An
`until` loop or `not` over another `not` reuses the inner code (`Ex.neg`) instead of stacking `!`.

A variable used inside a loop is kept in a JavaScript `let` local for the whole function
(`TargetCodegen.withLocals`), because locals are far faster than the target's variable objects.
Other scripts only run while this one yields, so the local is the truth in between: the function
loads its locals on entry, stores the ones it assigns before every yield, call, `stop` and at the
end, and reloads them after a yield or call. For a call to a plain-function procedure it stores
only the variables the callee reads and reloads only the ones it assigns (`analysis/effects.ts`),
unless the callee can `stop all`. A `wait until` reloads before checking its condition again.
Variables only used outside loops are read and written in place. `examples/locals` checks other
scripts and procedures see every change.

Comparisons against a
literal are specialized: a text literal makes it a lowercase string comparison, and a numeric
literal is passed as a number.

## Scheduler

`tick(rt)` in `packages/runtime/src/scheduler.ts` (`Runtime.tick()` calls it) runs one frame, with `step(rt, thread)` advancing a thread. It steps every thread in turn, repeating within a frame until most
of the frame budget is used, a redraw is requested outside turbo mode, or no thread can go on;
it reads the clock every few hundred microseconds rather than after every pass, and within a few
passes of a thread starting, since a new thread can make passes much heavier.

**When a frame ends early.** This follows TurboWarp's `stepThreads` (`src/engine/sequencer.js`
in its scratch-vm), which ends a frame when no thread is left with status `RUNNING` after a pass.
Its compiled scripts yield with the status unchanged, waits included, so a thread in `wait` or
`wait until` keeps the frame going and checks its wait again on the next pass: a `wait until`
sees what another thread did later in the same pass, and `wait(0)` takes no frame in turbo mode.
Only a thread that is done, waiting on a promise (`ask`, `say for secs`) or yielding for the rest of the frame
(`STATUS_YIELD_TICK`) does not count. In Bytecat a `WAIT` yield counts as going on, like a loop
yield, and the frame ends after a pass in which every step yielded `BLOCKED` (`thread.ts`) or ended
its thread. A thread that yields `BLOCKED` may be stepped again in the same frame, when other
threads keep it going, so it must check its condition again without side effects. `broadcast and
wait` yields `WAIT` even where TurboWarp uses `STATUS_YIELD_TICK` (every thread it waits for is
itself blocked); that only keeps an idle frame going, which nothing can observe.

**Time within a frame.** `rt.now()`, which `wait` and the `timer` read, stands still
while a frame runs, like TurboWarp's `currentMSecs`: on the real clock `tick` and the green flag
set it (`startFrame`), and on the virtual clock it is one frame per tick. So a wait can only end
at the start of a frame, however long the frame keeps checking it. `glide` reads `rt.liveNow()`
instead, the real clock at the call, since TurboWarp times a glide with a real-time `Timer`.

**Between frames.** TurboWarp's `say for secs` (`sayforsecs` in `scratch3_looks.js`) returns a
promise and clears the bubble from a `setTimeout` callback, which runs between frames; the redraw
that clear requests is dropped, since `_step` resets `redrawRequested` before it steps the threads.
`rt.later(ms, fn)` does the same: `startFrame` runs the callbacks that are due before `tick`
clears `redraw`. `sayFor` yields `BLOCKED` until its callback has run, and the callback clears the
bubble only if no other say replaced it. A stopped script's callback still runs and clears its
bubble. `stop all` drops only the last say-for callback set (`rt.bubbleTimeout`), as TurboWarp's
clears only `_bubbleTimeout`; any say-for callback that runs forgets it, as TurboWarp's sets
`_bubbleTimeout = null`, so a later pending one then survives `stop all`. Like a timer in Node and browsers, a delay below 1 ms or above
2^31 - 1 ms waits 1 ms. A pending callback counts as `rt.running`, so `runUntilDone` (in the
runtime and the player) and the trace oracle go on until it has run; the TurboWarp lockstep
driver counts its pending say-for timers the same way (`withTimerLabel` in `virtual.ts`).
`rt.scriptsRunning` counts only the threads, like TurboWarp's green flag indicator; the web app's
status line uses it.

**Sleeping waits.** Busy-waiting until the budget runs out, as TurboWarp does, would make every
frame with a pending `wait` cost three quarters of a frame of real time, even on the virtual
clock. A timed wait therefore yields `WAIT` once and then `SLEEP` each time it checks its time
and is not over (`glide` does the same on the virtual clock, once it has moved for the frame).
Since time stands still, a `SLEEP` step cannot end its wait in this frame and has no side
effects. So after a pass in which every step yielded `SLEEP` or `BLOCKED` the frame ends:
repeating that pass could change nothing. A pass in which a thread also ended does not end the
frame, since the ended thread may have done work, such as restarting a script behind it, that
TurboWarp would run within the frame.

**`stop all`** in a script reaches `step` as the `STOP_ALL` exception. As in TurboWarp, where
`runtime.stopAll()` replaces the thread list while the sequencer goes on through the old one, the
threads after the stopping one that were still running get one more step in that pass, except
those of clones, which TurboWarp stops when it disposes the clones (`examples/clones_stop_all`). They are
already marked done, so `broadcast and wait` sees them as finished, and threads they start go into
the new list and first run in the next pass. So `tick` steps the list it had when the pass began.

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
  The blocks request a redraw exactly where TurboWarp's renderer code does, since that decides
  where frames end: moving, turning, resizing or changing the costume of a visible sprite (and any
  backdrop change), showing a sprite, `wait`, and a speech bubble that appears on a visible sprite
  or a drawn one that goes away (`Target.bubbleDrawn`; show and hide bring back or remove the
  bubble, as TurboWarp re-renders it). Hiding a sprite without a drawn bubble, changing its layer,
  switching to a costume that does not exist, and a costume change or `say` on a hidden sprite do
  not end the frame (`packages/runtime/test/lib.test.ts`).

`spinLimit` is local to a `tick`. It starts at 1 each frame, and each time the scheduler reads the
clock while one thread runs alone it doubles, up to 32, if less than 0.25 ms passed since the
previous read, and drops back to 1 otherwise. While a thread spins the clock is read after every
pass, so at most 32 loop iterations run between two reads, and a loop whose iterations turn heavy
is noticed within 32 of them. (The clock-read stride over passes stops at 128, but rarely gets
there; a lone loop reaches its limit all the time, so its limit is lower.) It also drops back to 1
whenever a thread starts or finishes, because the cost of the last pass then says little about
the next one. A cheap loop body therefore runs up to 32 iterations per step, and a
heavy one is stepped once per iteration so a frame still ends on time. `packages/runtime/test/scheduler.test.ts` checks this, `examples/interleave`
the thread order, and `examples/paced_move` (see `turbo off` in
[pseudocode.md](pseudocode.md#output-and-testing)) the pacing of a loop that draws.

An event starts its hats in TurboWarp's order: targets from the top layer down, the stage last,
clones included, and within a target in the order its scripts appear in `project.json`
(`examples/script_order`). The runtime indexes each sprite's hats by event and argument, builds
the list of (target, hat) pairs an event starts the first time it fires, and drops those lists
when a sprite changes layer or a clone comes or goes; an event no hat listens to is never
stored. Starting a hat looks through the thread list once for that hat's thread on that target,
as TurboWarp does. A hat
that restarts a script puts the new thread in the old one's place in the thread list, so it runs
on the next pass if that place is already behind. That includes a thread that finished earlier in
the same pass, which stays listed until the pass ends, as in TurboWarp (`examples/restart_order`).
Whether a hat restarts its running script is TurboWarp's `restartExistingThreads`, which the
hat's extension declares and the compiler passes on as `restart: false` for the hats that do not
(`when key pressed`): pressing the key again while its script runs leaves the script alone, and a
start after it has finished goes at the end of the thread list. A key press starts the hats for
that key and then the "any" key hats, as two separate passes over the hats like TurboWarp
(`examples/key_restart`, `packages/runtime/test/hats.test.ts`).

Clones follow TurboWarp's `makeClone` (`lib/control.ts`, `packages/runtime/test/clones.test.ts`,
`examples/clones_*`). A clone is a `Target` made from its parent: a copy of its variables and
lists, position, direction, size, visibility, costume, rotation style, draggable and graphic
effects, but no bubble and no threads. It shares its sprite's `index`, costumes and hats, and is
listed in `rt.targets` after the originals, in the order the clones were made. Layers are
distinct numbers (`Target.all` renumbers them at load), and a clone goes just behind its parent,
as `goBehindOther` places it. At most `MAX_CLONES` (300) clones exist at once across all sprites,
counted as TurboWarp's `_cloneCounter` counts them; the stage cannot be cloned. The new clone's
"when I start as a clone" scripts start for it alone, and a visible clone requests a redraw, as
TurboWarp's renderer draws it at once. Clones hear broadcasts, keys and clicks like their
sprite. `stop all` (and so the green flag) removes every clone. `delete this clone` removes the
clone and stops its threads, and the script ends: a hat script returns, and a custom block throws
`RETIRE`, which `step` catches, like TurboWarp's `RETIRE_MAGIC`. Generated code stores the
variables it keeps in locals before `create clone` (the clone copies them) and before `delete
this clone`, and the effects analysis counts both blocks like `stop all`, so a call to a custom
block that may run them stores every local first. The renderers draw clones from `rt.targets`
like any sprite; the scratch-render backend gives each new clone a drawable with its sprite's
skins and destroys a deleted one's.

The list helpers in `ops.ts` (`itemOf`, `replaceAt`, `deleteOf`, `insertAt`, `indexOf`) have fast
paths for the common case of a number index (inlined floor and range check, no `listIndex`), and
use `pop()` / `shift()` / `push()` / `unshift()` instead of `splice` when the position is the
first or last. Strings and booleans take the general `listIndex` path. `ops.test.ts` compares every
helper to a copy of the slow implementation for every kind of index, so the results must stay
identical.

## Renderer

Scratch answers several block questions from its renderer: which sprite a click hits, how far a
sprite can leave the stage (fencing), whether it touches another sprite, the edge, the mouse or a
color, where `if on edge, bounce` turns, and how large `set size` may make it. Bytecat answers them
the same way (decision A): through a renderer interface, `RenderBackend` in
`packages/player/src/backend.ts`, with TurboWarp's scratch-render behind it. Nothing outside the
backend touches scratch-render, so another renderer means another implementation of the
interface.

| Backend | Where | Queries | Used by |
| --- | --- | --- | --- |
| `ScratchRenderBackend` | `scratch-render.ts` | TurboWarp's own: exact pixels, the same bounds, fence, picks and costume sizes | the browser oracle; the player with `backend: ScratchRenderBackend.create` |
| `Renderer` (Canvas 2D) | `renderer.ts` | pick by costume pixel; bounds, fence and touching by the costume's box; no `touching color` | the player by default (keeps the standalone page small: scratch-render adds about 1.6 MB of minified script) |

A backend is synced from the runtime (`sync`) before it draws and before a query, so the
runtime stays independent of it. Today the player uses it to draw and to hit-test clicks. The
blocks that need the other queries (fencing, touching, bounce, size limits) do not call it yet;
they are listed in [deviations.md](deviations.md#found-by-the-browser-oracle) and are Phase 2
work. `tests/browser-oracle.test.ts` checks that `ScratchRenderBackend` places every sprite as
TurboWarp's renderer does (bounds, fence, costume size, touching and picks).

## Differential fuzzing

`tests/fuzz/` generates random small programs (`generate.ts`), runs each on the Bytecat runtime and
on TurboWarp and compares their `log` lists (`run.ts`, `main.ts`). It exists so that optimizations
in the compiler cannot change program results without a test noticing. `tests/fuzz.test.ts` runs
50 fixed seeds in `pnpm test`; `pnpm fuzz --count N` runs more. See [fuzzing.md](fuzzing.md).

## Trace oracle

`packages/trace` compares two engines frame by frame rather than by their final log. Bytecat's
real scheduler and TurboWarp's sequencer both run on a virtual clock with a budget of passes per
frame, `pick random` is seeded, and the date is pinned. After every frame a snapshot of each engine
(variables, lists, and each sprite's position, direction, costume, size, visibility, bubble and
layer) is compared. `tests/trace.test.ts` traces every example and benchmark. The design, the
snapshot format and what headless TurboWarp cannot judge are in [testing.md](testing.md). The
browser oracle runs the same trace in Chromium against TurboWarp with its renderer
(`tests/browser-oracle.test.ts`).

## Design rules

- **Deterministic output.** Same input, same bytes: ids come from a counter and the zip has a
  fixed timestamp. This keeps snapshots and diffs meaningful.
- **TurboWarp is the oracle.** Behaviour is checked by running the same `.sb3` in TurboWarp
  (compiler on, every script must compile) and comparing the `log` list, not by asserting on
  generated code. Every example also runs in scratch-vm as a second check; where scratch-vm
  knowingly differs, its output goes in `NAME.scratch.expected` (or, for a TurboWarp-only block
  it cannot run, the reason in `NAME.scratch.skip`) and the difference is listed in
  [deviations.md](deviations.md).
- **Errors point at source.** Every pseudocode error carries file, line and column; the lowering
  step also records a block id → source line map (`bytecat build --map`).

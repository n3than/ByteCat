# Testing against TurboWarp

Bytecat has four oracles, all with TurboWarp (compiler on) as the ground truth:

| Oracle | Compares | Judges | Where |
| --- | --- | --- | --- |
| Example logs | the stage `log` list at the end of a finite run, in turbo mode | results | `tests/examples.test.ts` (`NAME.expected`) |
| Fuzzer | the same, for thousands of random programs | compiler optimizations | `pnpm fuzz`, [fuzzing.md](fuzzing.md) |
| **Trace** | everything visible after **every frame**, with scripted input, at normal pacing | frame timing, input, programs that never end | `pnpm bytecat trace`, `tests/trace.test.ts` |
| **Browser trace** | the same, against TurboWarp with its renderer, in Chromium | fencing, touching, bounce, size limits, clicks on sprites | `pnpm bytecat trace --browser`, `tests/browser-oracle.test.ts` |

A log cannot judge a game. Games run forever, react to keys and the mouse, and much of what they
show is never logged. The trace oracle runs Bytecat and TurboWarp in **lockstep**, one frame at a
time on a virtual clock. After every frame it takes a snapshot of each engine and reports the
first field that differs, in the same way the fuzzer reports the first differing log line.

```sh
pnpm bytecat trace examples/paced_move.sbp                         # 300 frames (10 s at 30 fps)
pnpm bytecat trace game.sb3 --frames 900 --input game.input --seed 7
pnpm bytecat trace game.sbp --passes 5 --turbo --json
```

It prints `agree on N frame(s)`, or the first difference with the value both engines had one
frame earlier and any other fields that differ in that frame:

```
first difference at frame 1, Stage.var.n: bytecat "1" but turbowarp "10"
  at frame 0 both had "0"
  also Cat.visible: bytecat "false" but turbowarp "true"
```

It exits with code 1 when it finds a difference or a problem. A problem is a block Bytecat does
not support, a script TurboWarp could not compile, or a crash.

## Snapshots

A snapshot (`packages/trace/src/snapshot.ts`) is a flat, ordered record of display strings. Frame
0 is the state after loading and the green flag, before any frame has run.

| Field | Value |
| --- | --- |
| `Stage.costume`, `Cat.costume` | `"2 walk"`: the 1-based number and the name |
| `Cat.x`, `Cat.y` | the position, after TurboWarp's `limitPrecision` (noise within 1e-9 of a whole number is dropped) |
| `Cat.direction`, `Cat.size`, `Cat.visible`, `Cat.rotationStyle` | as stored |
| `Cat.bubble` | `"say: hi"`, `"think: hm"` or `""` |
| `Stage.var.NAME`, `Cat.var.NAME` | the value as text, so a number and the string that prints the same are equal |
| `Stage.list.NAME` | the items as text; a difference names the first differing item and both lengths |
| `layers` | sprite names from the back layer to the front |

Each engine adapter (`bytecatState`, `turbowarpState`) reports raw state as a `StageState`. One
function, `toSnapshot`, turns that into display fields, so the same code normalizes every engine.
To compare more (clones, graphic effects, volume, pen, monitors), add the raw value to
`TargetState`, fill it in both adapters and add its field in `toSnapshot`. `snapshot.ts`,
`diff.ts`, `input.ts` and `reference/src/virtual.ts` have no Node imports, so a browser-side
driver can produce and compare the same snapshots.

## Determinism

While a frame runs, every input that depends on the machine is swapped out
(`withVirtualGlobals` in `packages/reference/src/virtual.ts`):

- **Time.** Frame `k` runs at virtual time `k * 1000 / fps` on both engines. TurboWarp's
  `currentMSecs` (which `wait`, `timer` and the compiled timers read) uses Bytecat's formula. So
  does its default `Timer` (glide). `say for secs` uses `setTimeout`, which runs on virtual
  timers that fire at frame boundaries.
- **`pick random`.** `Math.random` draws from mulberry32 with the seed (`--seed`, default 1). Each
  engine has its own generator with the same seed, so both see the same numbers as long as they
  draw in the same order. TurboWarp also draws 20 random characters for every new id (targets,
  clones, every speech bubble). `tw-ids.ts` puts a counter in Node's module cache before
  TurboWarp loads, so those draws never happen.
- **The date.** `Date.now()` is the pinned date (default 1 January 2026, 00:00 UTC) plus the
  virtual time, for `days since 2000`. `current (year, ...)` will also need `new Date()` pinned
  once Bytecat supports it.
- **Input.** Scripted input (below) is applied between frames, the same way on both engines.

## Frame boundaries

A frame in either engine ends when one of these happens:

- a redraw is requested (outside turbo mode);
- no thread can go on: every step in a pass ended its thread or blocked it until a later frame
  (`ask`; Bytecat's `BLOCKED`). A thread in `wait` or `wait until` can go on: TurboWarp's compiled
  waits keep their thread running, so both engines re-check them on the next pass;
- about 75% of the frame has passed on the wall clock.

Bytecat also ends a frame after a pass in which every thread only re-checked a timed wait that
cannot be over before the next frame (`SLEEP`, see [architecture.md](architecture.md#scheduler)).
TurboWarp goes on re-checking such waits until the budget runs out, but those passes change
nothing, so the snapshots agree.

The last rule makes the work done in a frame depend on the machine. Bytecat also lets a thread
that runs alone finish up to 32 loop iterations per step (`spin`), where TurboWarp finishes one.
So the oracle runs **both schedulers on a virtual cost clock**:

- **The budget is passes, not milliseconds.** A frame runs at most `passes` passes over the
  threads (default 50). Each pass steps every thread once. TurboWarp's sequencer reads its work
  timer once before each pass; the lockstep driver replaces that timer with one that runs out
  after `passes` reads. Bytecat's real scheduler (`tick`) runs with `passClock`, a scheduler clock
  that advances 0.25 ms per read. That makes `tick` read it after every pass, and the read after
  the last allowed pass is past the budget. The 0.25 ms step caps `passes` at 100 at 30 fps
  (50 at 60).
- **One loop iteration per step.** The Bytecat driver pins its runtime's `spin` to 0 (an accessor
  on that one instance, so the scheduler itself has no lockstep option), so a lone thread yields
  at the end of every loop iteration, as in TurboWarp. `spin` exists only to save scheduler work. A
  thread running alone cannot observe it, except through how much fits in a frame, and that is
  now set by the pass budget. `packages/runtime/test/scheduler.test.ts` checks spin itself.
- **Redraws as with a renderer.** Headless TurboWarp has no renderer, and TurboWarp only requests
  a redraw inside its renderer code paths. Without help, no frame would ever end on a redraw. On
  lockstep VMs, the driver patches `RenderedTarget` and the looks bubbles to request a redraw
  exactly where the renderer branch would. Bytecat's blocks follow the same rules (see
  [architecture.md](architecture.md#scheduler)). Not emulated yet: the redraws from
  `updateAllDrawableProperties` (clones), sound and pen. Whoever adds those blocks must extend
  the redraw patch in `packages/reference/src/tw-lockstep.ts`. The browser oracle (below) needs
  no emulation, and every example agreeing there at 50 and 1 passes is the check that the
  emulation requests redraws where the renderer does.

With these, a frame does the same work on both engines and ends at the same pass, whatever the
machine. `tests/trace.test.ts` checks this on every example and benchmark at 50, 7 and 1 passes
per frame. The small budgets move frame boundaries into the middle of loops.

What still differs is a real difference, and the oracle reports it. The known ones are listed in
[deviations.md](deviations.md#found-by-the-trace-oracle).

## Scripted input

`--input FILE` takes the `.input` format of [pseudocode.md](pseudocode.md#output-and-testing):
`press KEY`, `release KEY`, `click X Y`, `mouse X Y`, `answer TEXT` and `step N`. Frame 1 runs
with no input. Each command is then applied just before the next frame, and `step N` lets `N`
frames run without input. An answer waits in a queue until a question is open. Coordinates are
whole stage coordinates, because that is the only form a player and TurboWarp turn into the same
`mouse x`. `tests/trace.test.ts` traces every example with its `.input` file.

## What headless TurboWarp cannot judge

The headless VM has no renderer, so the Node trace oracle cannot judge anything that depends on
one:

- **Fencing.** TurboWarp keeps sprites on the stage through the renderer, so headless it never
  fences.
- **`touching`, `touching color`, `distance to`** need the renderer's pixels; headless `touching`
  is always false.
- **`if on edge, bounce`** uses the costume bounds.
- **Size limits.** TurboWarp clamps `set size` by the costume and stage size, using the renderer.
  Headless it stores any size.
- **Clicks.** Without a pick, a click always hits the stage, on both engines.

The browser oracle judges all of these.

## The browser oracle

```sh
pnpm bytecat trace tests/oracle/fence_move.sbp --browser    # same flags as above
```

The browser oracle runs the same trace (`traceEngines`, the same snapshots, input and frame
boundaries) in Chromium through Playwright, with TurboWarp's real renderer:

- `packages/trace/src/browser/oracle.ts` (Node) bundles `page.ts` with esbuild, opens it in
  headless Chromium and sends it the project. Chromium draws WebGL with SwiftShader, the same on
  every machine. The page is built once per process, in under a second.
- In the page, TurboWarp's VM gets TurboWarp's scratch-render on a 480 by 360 canvas, and
  scratch-storage for its costumes. It is driven by the same lockstep driver as in Node
  (`TurboWarpLockstepCore` in `packages/reference/src/tw-lockstep.ts`), with the same fake
  sequencer timer, virtual clock and seeded random, but **no redraw emulation**: the renderer
  requests redraws itself. The bundle swaps TurboWarp's `util/uid.js` for the same counter as in
  Node.
- Bytecat runs in the same page, on the same scheduler setup as in Node (`BytecatLockstep`), with
  its scratch-render backend (`ScratchRenderBackend`, see
  [architecture.md](architecture.md#renderer)) on a second canvas. Clicks are hit-tested by the
  backend, so a click on a sprite reaches that sprite on both engines.
- Both engines wait until every costume image has loaded before the green flag, as in the editor.
  scratch-render loads SVG images a task later; a sprite whose image has not loaded sits with its
  top left corner on its position and cannot be clicked.

`tests/browser-oracle.test.ts` checks four things, in about 15 seconds:

- every example and benchmark agrees for 300 frames at 50 and 1 passes per frame, as in the Node
  oracle;
- each program in `tests/oracle/` (one renderer-dependent behaviour each: the seven fencing
  blocks, bounce, size limits, touching and clicks on sprites) gives the result its entry in the
  test says. Where Bytecat does not match TurboWarp yet, the entry pins the first difference,
  and [deviations.md](deviations.md#found-by-the-browser-oracle) lists it. A fix makes the test
  fail until its entry says `agree`;
- the click program sends each click to the sprite TurboWarp picks;
- `ScratchRenderBackend` places every sprite as TurboWarp's renderer does. For several projects
  (`tests/oracle/backend.sbp` turns, flips, scales, hides and overlaps sprites) it compares the
  backend's bounds, fenced positions, costume sizes and touching with TurboWarp's, and what a
  click hits on a 10 pixel grid.

Lists longer than 1000 items are cut in the snapshots the page sends back. The comparison inside
the page still sees every item.

## What the browser oracle cannot judge

- **Pixels.** The oracle compares state, not what is drawn. `.pixels` probes in
  `tests/browser.test.ts` check Bytecat's own canvas.
- **Speech bubble layout.** A bubble is compared by its text, not by where it is drawn.
- **Sound and pen.** The page has no audio, and Bytecat has neither yet.
- **The GPU.** SwiftShader renders as a GPU would, but `touching color` on a real GPU can differ
  by a shade at antialiased edges.

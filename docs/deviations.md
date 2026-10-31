# Deviations

Bytecat matches TurboWarp's behaviour (compiler on), not the exact Scratch specification. This
file lists every known place where the engines Bytecat is checked against disagree, so a
difference is always a decision, never an accident.

## Intended Bytecat differences

Limits TurboWarp has and Bytecat leaves out by default, on purpose (Nathan's decision: a limit the
project did not ask for is not forced on it). Each one has a compat preset
behaviour: the `turbowarpCompat` preset in `@bytecat/runtime` (`--compat turbowarp` on the CLI,
`compat: turbowarpCompat` or `?compat=turbowarp` in the player) copies TurboWarp. The exact checks (the
frame-by-frame trace, the fuzzer and the log comparisons in `tests/compiler.test.ts`) run with
that preset (`EXACT_COMPAT` in `packages/trace/src/bytecat.ts`), and the relaxed comparison lets
each difference through by a named allowance (`ALLOWANCES` in `packages/trace/src/compare.ts`). An
example whose log shows a difference keeps TurboWarp's log in `examples/NAME.turbowarp.expected`,
which both reference engines are checked against; `tests/examples.test.ts` checks that every such
file is listed here.

| Difference | Default | Compat preset (`turbowarp`) | Allowance | Pinned by |
| --- | --- | --- | --- | --- |
| Clone limit. TurboWarp (and scratch-vm) let at most 300 clones exist at once, counted across all sprites, and `create clone` does nothing beyond that. | No limit (`cloneLimit: Infinity`). | `cloneLimit: 300`. | `clone-limit`: once TurboWarp has 300 clones and Bytecat more, the clones' fields, the clone count and the layer order are not compared. | `examples/clones_limit.expected` and `examples/clones_limit.turbowarp.expected`, `examples/clones_trace.turbowarp.expected`, "has no clone limit by default" in `packages/runtime/test/clones.test.ts`, "clone limit" in `tests/compiler.test.ts`. |
| Minimum size. `set size` and `change size` have no minimum but 0 in Bytecat: a sprite can shrink until it is gone. TurboWarp keeps a costume at least 5 pixels wide or high (10.42% of a 48 pixel costume). Both keep it at most 1.5 times the stage. | No minimum (`minSize: false`). | `minSize: true`. | `min-size`: a size below TurboWarp's, where TurboWarp's is 100% or less. | "fences, bounces and clamps the size with a geometry" and "keeps TurboWarp's minimum size with minSize" in `packages/runtime/test/lib.test.ts`; `tests/oracle/size_limits.sbp` with the preset. |


## From scratch-vm

Bytecat and TurboWarp agree here; only the official scratch-vm differs. An example that shows the
difference keeps scratch-vm's output in `examples/NAME.scratch.expected` next to
`examples/NAME.expected` (what TurboWarp and Bytecat produce). `tests/examples.test.ts` uses the
`.scratch.expected` file for scratch-vm and checks that every such file is listed below. An
example that uses a TurboWarp-only block, which scratch-vm cannot run at all, has
`examples/NAME.scratch.skip` (saying why) instead and is not run in scratch-vm; it is listed below too.

| Difference | Reason | Pinned by |
| --- | --- | --- |
| Custom reporters (a custom block with `return`, `procedures_return`) are a TurboWarp extension to Scratch. scratch-vm has no `return` block and runs a call in an input as a command, so these projects never finish there. | Follows TurboWarp. | `examples/custom_reporters.scratch.skip`, `examples/custom_reporters_yield.scratch.skip`. |
| scratch-vm caps a list at 200000 items and ignores adds beyond that; TurboWarp and Bytecat have no limit. | Follows TurboWarp. | `examples/list_limit.scratch.expected`. Benchmarks keep lists under the cap so every engine can run them (see [benchmarks.md](benchmarks.md)). |
| "contents of list" joins items without spaces when every item is one character long, counting numbers by their text: a list holding the numbers 3 and 4 (say from `add (1 + 2)`) prints "34". scratch-vm only counts text items and prints "3 4". Literals are not affected, since scratch-vm stores them as text. | Follows TurboWarp (`listContents` in its runtime). | `examples/constants.scratch.expected`. |

## From TurboWarp

Intended differences from TurboWarp itself, each with the reason (usually speed) and the example
or test that pins Bytecat's behaviour.

| Difference | Reason | Pinned by |
| --- | --- | --- |
| A list position of 2³² or more is out of range in Bytecat. TurboWarp's fast path cuts it to 32 bits (`index \| 0`), so `replace item 4294967297` changes item 1, while its `item 4294967297` still gives `""`. | Follows scratch-vm, since TurboWarp disagrees with itself here; no real list is that long. | "treats huge positions as out of range" in `packages/runtime/test/ops.test.ts`. |
| "go backward (n) layers" at the back with a fractional n between -1 and 0 (such as -0.5): TurboWarp's `moveExecutable` gets the index 0.5, and `splice` takes it as 0, so the sprite lands before the stage in `executableTargets` and its hats start after the stage's. The renderer keeps drawing it in front of the stage. Bytecat clamps the index to 1, in front of the stage, so its hats start before the stage's. Drawing is the same either way; only hat order differs. | A fractional layer count is a quirk of `splice`, and the drawn result is what a project can see. | "moves forward and backward by n layers and stops at the ends" in `packages/runtime/test/lib.test.ts`. |
| A `wait` inside a run-without-screen-refresh (warp) procedure always yields in Bytecat; TurboWarp's `yieldNotWarp` does not yield there, so a warp reporter calling a reporter with `wait(0)` can drift by a couple of frames. | Not intended: a known gap, still to be fixed. | Not pinned yet; the custom reporter examples avoid it. |
| `letter i of s` with an index of 2³¹ or more: where Bytecat proves the index is a whole number it uses `s.charAt(i - 1)` without TurboWarp's 32-bit cut, so `letter 4294967297` is `""`; elsewhere it cuts like TurboWarp and gives the first letter. TurboWarp does the same, but its type inference proves whole numbers in different places, so the two can pick different paths. | TurboWarp disagrees with itself here, and no real string is that long. | "index fast paths match the helpers" in `packages/compiler/test/blocks.test.ts`. |

## Found by the fuzzer

Places where Bytecat and TurboWarp still disagree, found by [the differential fuzzer](fuzzing.md).
Unlike the tables above these are not decisions: the first three are Bytecat bugs and the last two
are TurboWarp quirks Bytecat does not copy yet. `tests/fuzz/generate.ts` avoids each of them (the
`KNOWN:` comments) so the fuzzer can keep looking for other differences. When one is fixed, remove
the avoidance. Logs below are Bytecat, then TurboWarp.

| Difference | Smallest program | Bytecat / TurboWarp | Avoided by the generator |
| --- | --- | --- | --- |
| A boolean parameter that receives an empty boolean slot (a literal `false` argument) reads as `""`. | `define p(b: bool): log(b)` then `p(false)` | `` (empty) / `false` | A bare `false` is never passed as an argument. |
| `when flag` scripts in different targets start in declaration order (stage first). TurboWarp and scratch-vm start the topmost sprite first and the stage last. | `stage: when flag: log("stage")` and `sprite A: when flag: log("A")` | `stage`, `A` / `A`, `stage` | All flag scripts of a program live in one target. |
| A blank literal containing a tab (`"\t"`) is compared as text by the compiler, using `trim()`. TurboWarp counts a tab as zero. (The runtime helpers in `ops.ts` already match TurboWarp, so only literals are affected.) | `var s = "0"` then `log(s = "\t")` | `false` / `true` | The tab string is not used as a literal in expressions. |
| TurboWarp quirk: when one side of `<` or `>` is NaN and its compiler's type analysis knows the other side is a boolean, the boolean is read as the number 1 (`NaN > true` is `!(NaN <= 1)`, true). That side can be a boolean block, or a variable the same script set to a boolean with no yield in between. scratch-vm and Bytecat compare the text "nan" with "true". | `b = 0 / 0` then `log(b > (1 < 2))`; or `v = (1 < 2)` then `log((0 / 0) > v)` | `false` / `true` | A boolean block under `<`, `>`, `<=`, `>=` is wrapped as `join("", e)`, and so is a variable operand that the script or procedure set to a boolean earlier. |
| TurboWarp quirk: `"Infinity" = x` becomes a number comparison, so it is false when `x` is `"infinity"`. scratch-vm and Bytecat compare text ignoring case and say true. | `var g = "infinity"` then `log("Infinity" = g)` | `true` / `false` | A literal `"Infinity"` or `"-Infinity"` operand of a comparison is replaced by a computed infinity such as `(1 / 0)`. |

The fuzzer also found and fixed these in `packages/runtime/src/ops.ts` (covered by
`packages/runtime/test/ops.test.ts`): degree conversions rounded differently from TurboWarp in
`sin cos asin acos atan tan`; `tan` ignored TurboWarp's `% 360` and its `-270` / `-90` cases; the
text of a list treated a one-digit number as more than one character; list indexes `"LAST"` and
`"ALL"` were matched ignoring case; comparing a tab with 0
did not treat the tab as zero; `letter` of a large or fractional index was not cut to 32 bits.
It also found that a NaN result was not turned into 0 when it fed another numeric block, such as
`(0 / 0) + 1`; the compiler's type inference now keeps the cast wherever a value may be NaN.

## Found by the trace oracle

Places where Bytecat and TurboWarp still disagree, found by [the trace oracle](testing.md). These
are Bytecat bugs, not decisions. No example uses them, so `tests/trace.test.ts` stays green. Run
the smallest program with `pnpm bytecat trace FILE` (add `--turbo` or `--input` where noted).
Values below are Bytecat's, then TurboWarp's.

| Difference | Smallest program | First difference |
| --- | --- | --- |
| A bubble shows a number as is. TurboWarp rounds a non-integer of 0.01 or more to two decimals and cuts the text at 330 characters (`_formatBubbleText`). | `say(1.234)` | frame 1, bubble: `"say: 1.234"` / `"say: 1.23"` |
| `ask` from a hidden sprite shows the question in a bubble. TurboWarp only does that for a visible sprite. | sprite `hidden`, `ask("name?")` | frame 1, bubble: `"say: name?"` / `""` |
| `broadcast and wait` that waits on a thread which is itself in a `broadcast and wait` with all its threads ended (TurboWarp's STATUS_YIELD_TICK) keeps checking within the frame. TurboWarp's `waitThreads` counts such a thread, or one blocked in `say for secs` or `ask`, as waiting, and then waits a whole frame itself. Bytecat only takes the frame-long wait when every thread it waits on has ended (`untilDone` in `lib/event.ts`). | `when flag: broadcast("r"); broadcast("w2")`, `when flag: broadcast_wait("w2"); log(join("w1 ", n))`, `when flag: repeat 100000: n += 1`, `when receive "r": log("r")`, `when receive "w2": broadcast_wait("r"); log(join("w2 ", n))` (all in the stage) | frame 2, `Stage.list.log[4]`: `"w1 51"` / missing |
| `set rotation style` makes no redraw request, so it does not end a frame. TurboWarp's renderer requests one for a visible sprite. (The fix changes generated code.) | `repeat 10: rotation_style("left-right"); n += 1` | frame 1, `n`: `10` / `1` |

## Found by the browser oracle

Places where Bytecat and TurboWarp with its renderer still disagree, found by
[the browser oracle](testing.md#the-browser-oracle). These are Bytecat bugs.
Each has a program in `tests/oracle/`, and `tests/browser-oracle.test.ts` pins its first
difference, so a fix makes that test fail until its entry says `agree`. Run one with
`pnpm bytecat trace tests/oracle/NAME.sbp --browser`. Values below are Bytecat's, then
TurboWarp's; the sprite is the generated 48 pixel square or circle.

| Difference | Program | First difference |
| --- | --- | --- |
| `touching` (`sensing_touchingobject`) is not supported: the compiler warns and the block reads as false. | `touching` (with `touching.input`) | frame 8, `mouse`: `no` / `yes`, problem "bytecat does not support sensing_touchingobject" |

Clicks on sprites agree (`tests/oracle/click_sprites.sbp`): both of Bytecat's renderer backends
send a click to the topmost sprite with an opaque pixel under the mouse. Fencing (`fence_*`),
`if on edge, bounce` (`bounce`) and the size limits (`size_limits`) agree too: the blocks ask
`Runtime.geometry`, which in the browser oracle is the scratch-render backend.

## Headless geometry

Without a browser, the runtime answers the renderer's questions itself (`BoxGeometry` in
`packages/runtime/src/geometry.ts`, from the costume sizes measured when the project loads), and
the headless reference gives TurboWarp and scratch-vm a stand-in renderer that does the same
(`GeometryRenderer` in `packages/reference/src/tw-geometry.ts`), so that the two agree. Fencing
and the size limits are exact: TurboWarp fences with the costume's box (`getFenceBounds` is the
AABB) and clamps with the skin size, and `tests/browser-oracle.test.ts` checks the headless box,
fence and costume size against scratch-render bit for bit. What headless cannot match:

| Difference | Why | Where it shows |
| --- | --- | --- |
| The bounds of a visible sprite are its costume's box. scratch-render shrinks them to the convex hull of the costume's opaque pixels, so `if on edge, bounce` turns a few pixels later and puts the sprite back a few pixels further out. A hidden sprite's bounds are the box in TurboWarp too. | The hull needs the decoded pixels. | Headless runs and the Canvas 2D player; the player with `ScratchRenderBackend` and the browser oracle are exact. `examples/bounce` bounces hidden sprites, so its log is TurboWarp's. |
| An SVG without a `viewBox` is sized by its `width` and `height` attributes. scratch-svg-renderer measures the drawing (`getBBox`) instead. | Measuring needs a browser. | Costumes from outside the Scratch editor, which always writes a viewBox. |
| Without measured costume sizes (`RuntimeOptions.costumeSizes`), nothing is fenced, bounced or clamped, as in TurboWarp without a renderer. | A runtime made from project.json alone has no images. | Only code that builds a `Runtime` by hand; the CLI, the player, the benchmarks, the fuzzer and the oracles all pass the sizes. |
| In the headless reference, touching a sprite or a color is false and a click hits the stage. | The stand-in renderer draws nothing. | Nothing compiled yet: Bytecat does not support `touching`. |

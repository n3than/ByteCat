# Deviations

Bytecat matches TurboWarp's behaviour (compiler on), not the exact Scratch specification. This
file lists every known place where the engines Bytecat is checked against disagree, so a
difference is always a decision, never an accident.

## From scratch-vm

Bytecat and TurboWarp agree here; only the official scratch-vm differs. An example that shows the
difference keeps scratch-vm's output in `examples/NAME.scratch.expected` next to
`examples/NAME.expected` (what TurboWarp and Bytecat produce). `tests/examples.test.ts` uses the
`.scratch.expected` file for scratch-vm and checks that every such file is listed below.

| Difference | Reason | Pinned by |
| --- | --- | --- |
| scratch-vm caps a list at 200000 items and ignores adds beyond that; TurboWarp and Bytecat have no limit. | Follows TurboWarp. | `examples/list_limit.scratch.expected`. Benchmarks keep lists under the cap so every engine can run them (see [benchmarks.md](benchmarks.md)). |
| "contents of list" joins items without spaces when every item is one character long, counting numbers by their text: a list holding the numbers 3 and 4 (say from `add (1 + 2)`) prints "34". scratch-vm only counts text items and prints "3 4". Literals are not affected, since scratch-vm stores them as text. | Follows TurboWarp (`listContents` in its runtime). | `examples/constants.scratch.expected`. |

## From TurboWarp

Intended differences from TurboWarp itself, each with the reason (usually speed) and the example
or test that pins Bytecat's behaviour.

| Difference | Reason | Pinned by |
| --- | --- | --- |
| A list position of 2³² or more is out of range in Bytecat. TurboWarp's fast path cuts it to 32 bits (`index \| 0`), so `replace item 4294967297` changes item 1, while its `item 4294967297` still gives `""`. | Follows scratch-vm, since TurboWarp disagrees with itself here; no real list is that long. | "treats huge positions as out of range" in `packages/runtime/test/ops.test.ts`. |
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
| TurboWarp quirk: when a variable holds NaN, `v > (1 < 2)` and `v < (1 < 2)` are decided as if the boolean were the number 1. scratch-vm and Bytecat compare the text "nan" with "true". | `b = 0 / 0` then `log(b > (1 < 2))` | `false` / `true` | A boolean block under `<`, `>`, `<=`, `>=` is wrapped as `join("", e)`. |
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
| A frame ends as soon as every step in a pass returns WAIT, even when a thread did work before waiting. TurboWarp busy-waits and re-checks its waits until the frame budget runs out. | stage: `when flag: wait_until(x = 1); log("a")` and `when flag: x = 1; wait_until(x = 2)` | frame 1, `log`: `[]` / `["a"]` |
| The same rule in turbo mode: `wait(0)` takes a frame, but TurboWarp passes it within the frame. | `when flag: repeat 10: wait(0); n += 1` with `--turbo` | frame 1, `n`: `0` / `10` |
| `stop all` stops every thread at once. TurboWarp only stops the running one; the threads after it in the same pass still run their step before the list is cleared. This also shows in the log of a finite run. | stage: `when flag: n += 1; log(n)`, sprite: `when flag: stop("all")` | frame 1, `n`: `0` / `1` |
| `when key any` scripts start in the same pass as the scripts for the pressed key. TurboWarp starts every script for the key first, then the `any` ones. | sprite B: `when key "space": log("B space")`, sprite A on top: `when key "any": log("A any")`, input `press space` | frame 2, `log[1]`: `"A any"` / `"B space"` |
| A bubble shows a number as is. TurboWarp rounds a non-integer of 0.01 or more to two decimals and cuts the text at 330 characters (`_formatBubbleText`). | `say(1.234)` | frame 1, bubble: `"say: 1.234"` / `"say: 1.23"` |
| `ask` from a hidden sprite shows the question in a bubble. TurboWarp only does that for a visible sprite. | sprite `hidden`, `ask("name?")` | frame 1, bubble: `"say: name?"` / `""` |
| `set rotation style` makes no redraw request, so it does not end a frame. TurboWarp's renderer requests one for a visible sprite. (The fix changes generated code.) | `repeat 10: rotation_style("left-right"); n += 1` | frame 1, `n`: `10` / `1` |

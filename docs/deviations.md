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
or test that pins Bytecat's behaviour. None yet.

| Difference | Reason | Pinned by |
| --- | --- | --- |

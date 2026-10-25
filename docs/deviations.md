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
| scratch-vm caps a list at 200000 items; TurboWarp and Bytecat have no limit. | Follows TurboWarp. | Benchmarks keep lists under the cap (see [benchmarks.md](benchmarks.md)). |

## From TurboWarp

Intended differences from TurboWarp itself, each with the reason (usually speed) and the example
or test that pins Bytecat's behaviour. None yet.

| Difference | Reason | Pinned by |
| --- | --- | --- |

# Roadmap

The first milestone is a **walking skeleton**: the thinnest end-to-end path that takes a simple
project from text to running JavaScript and measures it. Block coverage grows only after every
stage exists.

1. **Pseudocode to sb3** (done). A text format agents can write test projects in, compiled to
   valid `.sb3`, plus a headless scratch-vm runner as the source of truth for behaviour.
2. **sb3 to JavaScript** (done). `@bytecat/compiler` walks the block graph and generates one
   generator function per script, with light static typing to skip needless casts. Loops yield
   once per iteration unless in warp mode, so `forever` does not freeze the page.
   `@bytecat/runtime` is the headless scheduler and block helpers it runs on. Covers events,
   control, operators, variables, lists, custom blocks, and basic motion and looks. Later
   speedups: compile yield-free scripts as plain functions, and type variables.
3. **Canvas renderer** (done, `@bytecat/player`). A 480x360 canvas draws sprites and costumes
   (position, size, direction, rotation style, layering, visibility, backdrops), say and think
   bubbles, and handles keyboard and mouse input. `bytecat bundle` produces one standalone HTML
   file. Test mode (`?test`) makes it deterministic, so examples can check pixels and scripted
   input in a real browser. The renderer approximates Scratch: no graphic effects (color,
   fisheye, ghost and so on), and `if on edge, bounce` uses the sprite's point position rather than
   its costume bounds.
4. **Benchmark harness** (done, `@bytecat/bench`). `pnpm bench` runs every `bench/*.sbp` through
   sb3 to JS, checks the `log` output against `.expected`, and times Bytecat, scratch-vm and
   TurboWarp (compiler on) side by side. See
   [benchmarks.md](benchmarks.md).

Out of scope for the proof of concept: pen, sound, clones, collision (`touching`), extensions,
cloud variables, and exact Scratch compatibility in edge cases (Bytecat is fast first).

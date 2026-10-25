# Roadmap

The first milestone is a **walking skeleton**: the thinnest end-to-end path that takes a simple
project from text to running JavaScript and measures it. Block coverage grows only after every
stage exists.

1. **Pseudocode to sb3** (done). A text format agents can write test projects in, compiled to
   valid `.sb3`, plus a headless scratch-vm runner as the source of truth for behaviour.
2. **sb3 to JavaScript** (`@bytecat/compiler`). Parse `project.json` into an IR and generate one JS
   function per script. Loops yield once per frame (unless in warp mode) so `forever` does not
   freeze the page. Target block set: events (green flag, broadcasts, keys, clicks), control
   (`repeat`, `repeat until`, `forever`, `if`/`else`, `wait`, `wait until`, `stop`), all operators,
   variables, lists, custom blocks, and basic motion and looks.
3. **Minimal runtime** (`@bytecat/runtime`). A 30 fps scheduler, a 480x360 canvas that draws
   sprites and costumes, mouse and keyboard input, say bubbles.
4. **Benchmark harness** (`@bytecat/bench`). One command that takes `examples/*.sbp` through sb3 to
   JS, checks the `log` output against `.expected`, and times it against scratch-vm and TurboWarp.

Out of scope for the proof of concept: pen, sound, clones, collision (`touching`), extensions,
cloud variables, and exact Scratch compatibility in edge cases (Bytecat is fast first).

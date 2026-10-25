# Roadmap

**Goal: a production-ready web app for professional block-based applications.** Bytecat compiles
Scratch projects to JavaScript that runs close to the speed of hand-written JavaScript and behaves
like TurboWarp. It does not follow the Scratch specification where that costs speed and no
real project depends on it.

The milestones run in order. Each one builds on a base that the one before it made solid, and
each is done only when its checks are automatic and pass in `pnpm verify`.

## Rules for every milestone

- **TurboWarp is the behaviour oracle.** Every example and benchmark runs in TurboWarp (compiler
  on) and must agree with it. scratch-vm stays as a second check; where the two disagree, Bytecat
  follows TurboWarp. Every intended difference from TurboWarp is listed in `docs/deviations.md`
  with the reason and a test that pins it.
- **Nothing is checked by eye.** A change lands with an example (`.expected`, `.pixels`,
  `.input`), a unit test or a benchmark that fails without it.
- **No speed regressions.** A change that slows any benchmark beyond run-to-run noise needs a
  stated reason in its PR.
- **Model routing.** Opus designs (compiler, scheduler, optimizations, debugging differences);
  Sonnet implements well-specified steps. See `AGENTS.md`.

## 1. Modular base

Split the pipeline into small modules that can each be checked on their own, so the codebase can
grow without any one file becoming the bottleneck.

- **Compiler.** Break `codegen.ts` into one emitter module per block family (events, control,
  operators, data, procedures, motion, looks), registered by opcode, plus separate modules for
  the shared parts: type information, expression casting, script and procedure shape. Adding a
  block means adding one emitter and its test.
- **Runtime.** Separate the scheduler, threads, targets, events and value helpers (`ops.ts`) into
  modules with narrow interfaces, so the scheduler can be tuned without touching block helpers.
- **Pseudocode.** Split `lower.ts` the same way, by block family.
- **CI.** Run `pnpm verify` and `pnpm bench` on every pull request on GitHub Actions.

Verified by: the generated JavaScript for every example and benchmark is byte-for-byte unchanged
by the split (a snapshot test checks it), every existing test passes, benchmark times stay within
noise, and each new module has its own unit tests in its package.

## 2. Performance toward native JavaScript

Close the gap between Bytecat and hand-written JavaScript while keeping TurboWarp's behaviour.

- **Measure against native.** Add a hand-written JavaScript version of each benchmark
  (`bench/NAME.native.js`) and report Bytecat's time as a multiple of it, next to the TurboWarp
  speedup. Add benchmarks for the patterns real projects use most: clones, list-heavy data,
  string building, sprite movement and rendering-bound loops.
- **Optimization plan.** An Opus thread at high effort studies the current compiler and runtime
  and writes `docs/optimizations.md`: a ranked list of optimizations, each with the expected gain,
  the risk to behaviour, and the benchmark and tests that prove it. Candidates include type
  inference for variables and loop counters, unboxed number paths, cheaper list storage,
  inlining small custom blocks, constant folding, and lower scheduler and generator overhead.
- **Implementation.** Sonnet implements the plan one optimization per pull request, in ranked
  order.
- **Differential testing.** A generator of small random but deterministic programs that run in
  Bytecat and TurboWarp and must produce the same log, to catch the subtle casting and type bugs
  that optimizations introduce.

Verified by: each optimization PR shows the benchmark it targets getting faster with no other
benchmark slower, every example still matches TurboWarp, and the differential tests pass over a
fixed seed range in `pnpm verify` (a longer run in CI). The milestone is done when the warp
benchmarks run within an agreed multiple of native JavaScript (target: 2x) and every benchmark
beats TurboWarp.

## 3. TurboWarp coverage

Only once the base is modular and fast, extend it toward what TurboWarp runs, family by family.
Each family is designed for speed from the start and gets its own benchmark.

1. **Clones** and **sensing** (`touching`, colour touching, distance, mouse, timer, key state).
2. **Costume bounds and graphic effects**, so `if on edge, bounce`, collision and rendering match.
3. **Pen.**
4. **Sound** (play, stop, volume, effects) through Web Audio.
5. **Extensions**: TurboWarp's built-in ones first (music, text-to-speech where possible),
   then a stable API for custom extensions.
6. **Real projects**: bitmap costumes, every asset format, project settings (frame rate,
   stage size, interpolation) and cloud variables (local only).

Verified by: each family adds examples with expected logs, pixel probes and scripted input that
agree with TurboWarp, and a benchmark. A corpus of real `.sb3` projects (`corpus/`) is loaded in
`pnpm verify`; the share of its blocks that compile without warnings is tracked and must not drop.

## 4. Production web app

Turn `@bytecat/web` into an app teams can build and ship professional block-based applications
with.

- **Loading and errors.** Any project from Scratch or TurboWarp opens; unsupported blocks and
  assets are reported clearly and never crash the player.
- **Shipping.** Exported players are small, fast to start and embeddable, with a documented
  JavaScript API (start, stop, broadcast, read and set variables, events out).
- **Product quality.** Works in current Chrome, Firefox and Safari, on desktop and mobile, with
  keyboard access; versioned releases with a changelog; deployed from CI.

Verified by: browser tests drive every app flow (open, run, stop, export, embed) in Chromium,
Firefox and WebKit; the real-project corpus plays in the exported player; a size budget for the
player bundle and a start-up time budget are checked in CI.

## Done: proof of concept

Pseudocode to `.sb3` with scratch-vm and TurboWarp as oracles; `.sb3` to JavaScript with a
headless runtime; a canvas renderer with test mode; the benchmark harness, where Bytecat beats
TurboWarp on all six benchmarks; and the first web app ([web.md](web.md)).

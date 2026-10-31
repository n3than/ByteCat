# Working on Bytecat

Bytecat is a Scratch 3 to JavaScript transpiler that matches TurboWarp's behaviour, not the exact
Scratch specification. Read
`docs/architecture.md` for the layout and `docs/roadmap.md` for what is in scope.

## Commands

```sh
pnpm install
pnpm verify          # typecheck, then all tests; must pass before you finish
pnpm test            # all tests, including the browser tests
pnpm typecheck       # tsc over every package
pnpm bytecat run examples/NAME.sbp     # run a pseudocode or .sb3 project on the Bytecat runtime
pnpm bytecat run examples/NAME.sbp --engine reference  # run it in scratch-vm instead (second check)
pnpm bytecat run examples/NAME.sbp --engine turbowarp  # run it in TurboWarp (compiler on): the behaviour oracle
pnpm bytecat compile examples/NAME.sbp -o out.js        # compile to a JS module
pnpm bytecat bundle examples/NAME.sbp -o out.html       # standalone HTML player (open it with ?test for test mode)
pnpm examples:html   # bundle every example into out/examples
pnpm web             # build the web app into out/web/index.html (docs/web.md)
pnpm bytecat compare examples/NAME.sbp # relaxed check against TurboWarp (also any .sb3 or a folder of them)
pnpm bytecat trace examples/NAME.sbp   # exact check: every frame the same as TurboWarp
pnpm bytecat dump examples/NAME.sbp    # print the generated project.json
pnpm bench           # time bench/*.sbp on each engine (add names, --engines, --runs); exits 1 on a wrong log
pnpm fuzz            # differential fuzzer: random programs on Bytecat vs TurboWarp (--count N --seed S --also-scratch)
pnpm bytecat trace examples/NAME.sbp --frames 300 [--input F] [--seed S]  # frame-by-frame oracle vs TurboWarp (docs/testing.md)
pnpm bytecat trace tests/oracle/NAME.sbp --browser   # the same in Chromium, against TurboWarp with its renderer
pnpm run docs        # regenerate the builtin tables in docs/pseudocode.md and docs/blocks.md (`pnpm docs` is a pnpm built-in)
```

## Writing test projects

Write Scratch projects in pseudocode (`docs/pseudocode.md`), not by hand-editing `project.json`.
To add a test project, add `examples/NAME.sbp` and `examples/NAME.expected` (one expected `log()`
item per line). Run `pnpm bytecat run examples/NAME.sbp --engine reference` to see what the reference VM produces,
check it is what Scratch should do, then save it as the expected file. Keep examples small,
deterministic (no `random()`, `timer()` or user input in checked output) and finite (every script
must stop; use `stop("all")` to end `forever` loops).

A new benchmark goes in `bench/NAME.sbp` with a `bench/NAME.expected` file in the same way (see
`docs/benchmarks.md`); `tests/bench.test.ts` checks every one on both engines.

## Automatic verification

Every behaviour change must be covered by an automatic check, never by looking at it yourself:
the log in `examples/NAME.expected`, pixel probes in `examples/NAME.pixels`, scripted input in
`examples/NAME.input` (formats in `docs/pseudocode.md`, "Output and testing"), or a unit test in
`packages/NAME/test/`. Rendering and input changes get a `.pixels` / `.input` example. When you add
probes, render the page and look at a screenshot to choose points well inside shapes. Run
`pnpm verify` and make it pass before finishing.

Checks against TurboWarp come in two kinds (`docs/testing.md`, "Relaxed and exact checks"):

- **Relaxed** is the default for every example and real `.sb3`: Bytecat with its own defaults
  (no clone limit), compared at checkpoints with tolerances, a ±2 frame window and the allowed
  intended differences. Use it unless timing is the point. An optional `NAME.compare.json` tunes
  it; prefer an `ignore` entry naming the values an intended difference changes over loosening
  the tolerances.
- **Exact** compares every frame (or the whole log) with Bytecat on TurboWarp's limits
  (`EXACT_COMPAT`). The fuzzer, the log comparisons and the scheduler-sensitive examples in the
  `EXACT` list of `tests/trace.test.ts` use it. Add an example to `EXACT` when it tests the frame
  something happens in.

An intended difference from TurboWarp is a runtime option with a `turbowarpCompat` preset value, a row
under "Intended Bytecat differences" in `docs/deviations.md`, an allowance in
`packages/trace/src/compare.ts`, and `NAME.turbowarp.expected` for an example whose log shows it.

The browser tests need Chromium. First-time setup: `pnpm exec playwright install chromium`.

## Conventions

- One package per pipeline stage under `packages/`. A package exports `src/index.ts` and has its
  tests in `packages/NAME/test/`. Cross-package tests go in `tests/`.
- TypeScript strict mode, ES modules, `.js` extensions in relative imports, two-space indent.
- Keep output deterministic. Never use `Math.random()` or wall-clock time for ids or file content.
- Errors in user input are `PseudoError`s with a source position and a message that says how to
  fix the problem.
- New pseudocode builtin: add it to `packages/pseudo/src/builtins.ts`, run `pnpm run docs`, and cover
  it in an example or a test in `packages/pseudo/test/lower.test.ts`.
- New syntax: update `ast.ts`, `parser.ts`, `lower.ts`, `docs/pseudocode.md`, and add tests.
- `tests/lower-hashes.test.ts` pins `project.json` hashes (fixture `tests/fixtures/lower-hashes.json`) and ignores new examples. When pseudocode lowering intentionally changes or the fuzz generator changes, regenerate it with `WRITE_LOWER_HASHES=1 pnpm exec vitest run tests/lower-hashes.test.ts` and review the diff.
- New Scratch block in the compiler: every category is an extension (`docs/extensions.md`). Replace the opcode's `missing(...)` entry in `packages/compiler/src/extensions/ID.ts` with its handler (with `yields`, `substacks` and `uses` as they apply), add a test in `packages/compiler/test/blocks.test.ts`, and run `pnpm run docs` to update `docs/blocks.md`. Keep compiler stages small and pure so each can be tested alone.
- Update `docs/` in the same change as the code it describes.

## Model routing

When work is split across agents, send trivial, well-specified code (boilerplate, new example
projects, adding a builtin row, doc updates, simple tests) to Sonnet. Keep Opus for the complex
parts: language and compiler design, code generation, the runtime scheduler, performance work,
and debugging behaviour differences against scratch-vm.

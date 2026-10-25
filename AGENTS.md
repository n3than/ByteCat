# Working on Bytecat

Bytecat is a Scratch 3 to JavaScript transpiler, built as a proof of concept first. Read
`docs/architecture.md` for the layout and `docs/roadmap.md` for what is in scope.

## Commands

```sh
pnpm install
pnpm verify          # typecheck, then all tests; must pass before you finish
pnpm test            # all tests, including the browser tests
pnpm typecheck       # tsc over every package
pnpm bytecat run examples/NAME.sbp     # run a pseudocode or .sb3 project on the Bytecat runtime
pnpm bytecat run examples/NAME.sbp --engine reference  # run it in scratch-vm instead (ground truth)
pnpm bytecat compile examples/NAME.sbp -o out.js        # compile to a JS module
pnpm bytecat bundle examples/NAME.sbp -o out.html       # standalone HTML player (open it with ?test for test mode)
pnpm examples:html   # bundle every example into out/examples
pnpm bytecat dump examples/NAME.sbp    # print the generated project.json
pnpm bench           # time bench/*.sbp on each engine (add names, --engines, --runs); exits 1 on a wrong log
pnpm docs            # regenerate the builtin tables in docs/pseudocode.md
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

The browser tests need Chromium. First-time setup: `pnpm exec playwright install chromium`.

## Conventions

- One package per pipeline stage under `packages/`. A package exports `src/index.ts` and has its
  tests in `packages/NAME/test/`. Cross-package tests go in `tests/`.
- TypeScript strict mode, ES modules, `.js` extensions in relative imports, two-space indent.
- Keep output deterministic. Never use `Math.random()` or wall-clock time for ids or file content.
- Errors in user input are `PseudoError`s with a source position and a message that says how to
  fix the problem.
- New pseudocode builtin: add it to `packages/pseudo/src/builtins.ts`, run `pnpm docs`, and cover
  it in an example or a test in `packages/pseudo/test/lower.test.ts`.
- New syntax: update `ast.ts`, `parser.ts`, `lower.ts`, `docs/pseudocode.md`, and add tests.
- Update `docs/` in the same change as the code it describes.

## Model routing

When work is split across agents, send trivial, well-specified code (boilerplate, new example
projects, adding a builtin row, doc updates, simple tests) to Sonnet. Keep Opus for the complex
parts: language and compiler design, code generation, the runtime scheduler, performance work,
and debugging behaviour differences against scratch-vm.

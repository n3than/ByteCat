# Working on Bytecat

Bytecat is a Scratch 3 to JavaScript transpiler, built as a proof of concept first. Read
`docs/architecture.md` for the layout and `docs/roadmap.md` for what is in scope.

## Commands

```sh
pnpm install
pnpm test            # all tests; must pass before you finish
pnpm typecheck       # tsc over every package; must pass before you finish
pnpm bytecat run examples/NAME.sbp     # run a pseudocode or .sb3 project in scratch-vm
pnpm bytecat dump examples/NAME.sbp    # print the generated project.json
pnpm docs            # regenerate the builtin tables in docs/pseudocode.md
```

## Writing test projects

Write Scratch projects in pseudocode (`docs/pseudocode.md`), not by hand-editing `project.json`.
To add a test project, add `examples/NAME.sbp` and `examples/NAME.expected` (one expected `log()`
item per line). Run `pnpm bytecat run examples/NAME.sbp` to see what the reference VM produces,
check it is what Scratch should do, then save it as the expected file. Keep examples small,
deterministic (no `random()`, `timer()` or user input in checked output) and finite (every script
must stop; use `stop("all")` to end `forever` loops).

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

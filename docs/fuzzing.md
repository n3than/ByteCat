# Differential fuzzing

Compiler optimizations (type inference, numeric constants) must never change what a program
prints. The fuzzer checks that on thousands of random programs: it generates small Scratch
programs in pseudocode, runs each on Bytecat and on TurboWarp (compiler on), and compares the
`log` lists. TurboWarp is the ground truth, so a difference is a Bytecat bug unless it is listed
in [deviations.md](deviations.md).

```sh
pnpm fuzz                          # 200 programs, seeds 1..200
pnpm fuzz --count 1000 --seed 5000 # seeds 5000..5999
pnpm fuzz --seed 4321 --count 1    # replay one seed
pnpm fuzz --also-scratch           # also run scratch-vm and list where it differs from TurboWarp
```

It prints progress every 50 programs and a summary. For each mismatch it prints the seed, the
first differing `log` line (index and both values), both logs and the program, and it writes the
program to `out/fuzz/seed-<n>.sbp` (`--out DIR` changes the folder). It exits with code 1 on any
mismatch. A run also counts as a mismatch when Bytecat throws, an engine does not finish, or
TurboWarp falls back to its interpreter for a script. `--also-scratch` is informational: scratch-vm
disagreeing with TurboWarp never fails the run.

`pnpm test` runs `tests/fuzz.test.ts`: 50 fixed seeds on both engines, plus a check that 500
seeds compile without a `PseudoError` and that the generator is deterministic.

## Layout

| File | Role |
| --- | --- |
| `tests/fuzz/generate.ts` | `generateProgram(seed)` returns pseudocode. A seeded PRNG (mulberry32); no `Math.random`, no clock. |
| `tests/fuzz/run.ts` | `fuzzOne(seed)` compiles the program, runs it on Bytecat (virtual clock, turbo, `EXACT_COMPAT`: TurboWarp's limits, see [testing.md](testing.md#relaxed-and-exact-checks)) and TurboWarp, returns `{ seed, source, bytecat, turbowarp, firstDiff, problems }`. |
| `tests/fuzz/main.ts` | The `pnpm fuzz` command. |
| `tests/fuzz.test.ts` | The vitest check. |

Bytecat runs the project read back from the `.sb3` bytes, like the CLI does, so every engine
sees exactly the same data.

## What the programs contain

Every program is finite and deterministic: loops have small literal counts (or `(expr % 3)`),
`while` and `repeat until` loops carry their own bound counter, recursion stops at depth 3, and
there is no `random()`, `timer()`, input or `wait`.

- **Awkward values.** Stage, sprite and list initial values are drawn from `0`, `1`, `-1`, `1.5`,
  `""`, `" "`, `"1.0"`, `" 5 "`, `"5 "`, `"1e3"`, `"0x10"`, `"-0"`, `"Infinity"`, `"-Infinity"`,
  `"NaN"`, `"abc"`, `"ABC"`, `"true"`, `"false"`, `"é"` and more (large integers, `2147483648`,
  `9007199254740993`, `1e21`, `1e-7`, `"+5"`, `".5"`, `"5."`, `"0b11"`, ...). Number literals
  (`1`) and string literals (`"1"`) are both used.
- **Expressions.** `+ - * / %`, `round` and the math functions, `join`, `letter`, `length`,
  `contains`, `< > = != <= >=`, `and`/`or`/`not`, list reads, and booleans used as values.
  Division by zero, `0 / 0`, `Infinity - Infinity`, large numbers and negative `%` come up
  through the awkward values.
- **Statements.** `set`, `change`, `if`/`else`, `repeat`, `for`, `while`, `repeat until`, and
  `log(expr)` everywhere so intermediate values are visible. Each script ends by logging some
  variables.
- **Lists.** `add`, `insert`, `replace`, `delete`, `clear`, `item`, `length`, `contains`,
  `index_of` and the list as text, with indexes such as `"last"`, `"all"`, `0`, `-1`, `1.5`,
  `"1.0"`, `99` and `""`.
- **Custom blocks.** `define` and `define warp`, value and boolean parameters, literal and
  computed arguments, calls from scripts and from other blocks, and one recursive block that
  counts its depth.
- **Threads.** Sometimes several `when flag` scripts in one target, and a `when receive "go"`
  script fed by `broadcast` or `broadcast_wait`, so loops that yield interleave.
- **Clones.** In about 40% of programs, sprites run `create_clone()`, `create_clone("_myself_")`
  or `create_clone("B")` and `delete_clone()` (under a random condition, or at the end of a script),
  and one or two `when cloned` scripts change a sprite-local variable, log it and run ordinary
  statements. A global counter `ncl`, which nothing else writes, caps the clones a program makes at
  4 (every create sits under `if ncl < 4`), so clones of clones stay finite and deterministic.

## Known gaps in what it generates

The generator avoids a few constructs on which Bytecat and TurboWarp are known to disagree. Each
is marked `KNOWN:` in `generate.ts` and listed in [deviations.md](deviations.md#found-by-the-fuzzer).
When one of them is fixed, remove the avoidance and let the fuzzer confirm.

## Turning a failing seed into an example

1. Replay it: `pnpm fuzz --seed N --count 1`. The program is also in `out/fuzz/seed-N.sbp`.
2. Shrink it. Delete statements and simplify expressions by hand until the smallest program that
   still shows the difference is left. After each change run it on both engines:

   ```sh
   pnpm bytecat run out/fuzz/seed-N.sbp
   pnpm bytecat run out/fuzz/seed-N.sbp --engine turbowarp
   ```

3. Decide who is right. TurboWarp is the ground truth; if you suspect it is wrong too, check
   `--engine reference` (scratch-vm). If Bytecat is wrong, fix it. If TurboWarp is knowingly
   different from Scratch and Bytecat should follow it, say so in the example.
4. Save the small program as `examples/NAME.sbp` and TurboWarp's output as
   `examples/NAME.expected` (`pnpm bytecat run examples/NAME.sbp --engine turbowarp > examples/NAME.expected`).
   If scratch-vm differs, also save `NAME.scratch.expected` and list it in
   [deviations.md](deviations.md). Keep it small, deterministic and finite.
5. Run `pnpm verify`. The new example fails until the bug is fixed.

If you cannot fix the bug right away, make the generator avoid the construct with a narrow
exclusion and a `// KNOWN:` comment, and add a row to deviations.md, so `pnpm verify` stays green
and the fuzzer keeps finding new things.

## How a program is built

`generate.ts` decides the globals, sprites and scripts first, then the procedures, then fills
every script with statements from the weighted choice in `statement()`. Two rules keep the
programs well behaved:

- **Stored joins stay short.** A `join` whose result is stored (assigned, added to a list,
  passed as an argument) has at most one operand that can hold a long string. Otherwise
  `x = join(x, y)` followed by `y = join(x, x)` doubles the string on every step.
- **Some procedures are guarded.** A guarded warp procedure assigns one variable inside a loop,
  only when its first argument matches, and never reads it; a `guardcall` statement changes that
  variable in a loop just before calling it. This checks that a compiler which keeps variables in
  locals stores the caller's value before a call that may store a stale one back.

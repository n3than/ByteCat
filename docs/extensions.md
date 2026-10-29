# Extensions

Every block category is an extension, built-in or not. Motion, looks, the other Scratch
categories, Pen, Music and a third-party extension all plug into the compiler through the same
API, in `packages/compiler/src/extensions/`. The compiler itself knows no opcode: the code
generator, the yield analysis, the block inventory and [blocks.md](blocks.md) all read the
extension specs.

## Why it looks like this

The goal is generated code with no runtime layers (see the vision in the block coverage plan):
each block compiles to the JavaScript for its operation, or to a call to a plain, named runtime
function when the semantics need one. An extension is therefore a set of **compile-time** rules.
The registry is consulted while compiling and never exists at run time: there is no dispatch
table, no block-function lookup and no argument object in the generated program. A block that
reads `move(rt, t, 10);` in the output was written by the motion extension's handler, and the
handler declares that it calls `move` (`uses`) from `@bytecat/runtime/motion` (`runtime`), so a
program imports exactly the runtime functions its blocks call and a bundled project ships only
those. A third-party extension gets
the same treatment, not a generic compatibility path.

## An extension

```ts
import { hat, missing, numEx, reporter, statement, type Extension } from "@bytecat/compiler";

export const counter: Extension = {
  id: "counter", // the opcode prefix, and the id project.json lists under `extensions`
  name: "Counter", // the name docs show
  runtime: "./counter-runtime.js", // the module a program imports `uses` from
  blocks: {
    counter_whenstarted: hat("flag", { restartExistingThreads: true }),
    counter_bump: statement((b, g) => [`bump(rt, ${g.num(b, "BY")});`], { uses: ["bump"] }),
    counter_pause: statement((b, g) => g.y(`yield* pause(rt, ${g.num(b, "SECS")});`), { yields: "wait", uses: ["pause"] }),
    counter_value: reporter(() => numEx("counterValue(rt)"), { uses: ["counterValue"] }),
    counter_reset: missing("statement", "not written yet"),
  },
};
```

`id` is Scratch's opcode prefix (`motion` for `motion_movesteps`, `pen` for `pen_penDown`), and
every opcode the extension declares must start with `${id}_`. The core ids are `motion`, `looks`,
`sound`, `event`, `control`, `sensing`, `operator`, `data`, `procedures` and `argument`; `pen` is
the first non-core one, and `music` and others follow the same pattern.

`blocks` lists **every** opcode the extension knows, compiled or not. Each entry is a spec
(`BlockSpec` in `extensions/api.ts`) with a `kind`, a `status` and, depending on the kind, how to
compile it. The helpers `statement`, `reporter`, `boolean`, `hat`, `menu`, `missing` and
`missingHat` build specs and keep extension files short.

### What every spec says

| Field | Meaning |
| --- | --- |
| `kind` | `statement`, `reporter`, `boolean` (a hexagonal reporter), `hat` or `menu` (a shadow menu). |
| `status` | `compiled` (matches TurboWarp), `partial` (compiles, but differs from TurboWarp in a case real projects reach) or `missing` (reported as an unsupported block). The helpers set it: `partial: "note"` makes a block partial. |
| `note` | What is partial or missing; required for both. Shown in [blocks.md](blocks.md). |
| `hidden` | Not in the default palette: Scratch 2 leftovers and TurboWarp-only blocks. |
| `uses` | The plain runtime functions (and constants such as `WAIT`) the generated code calls, by name, from the extension's `runtime` module: `move` for `move(rt, t, 10)`, `itemOf` for the list helper. A program imports each one its code calls and nothing else (see "Runtime functions" below). What the code generator emits itself (the casts, the contents of a list dropped into an input) is in `CODEGEN_USES` (`emit.ts`) and not listed, and nor is the runtime state the code reads off `rt` (`rt.answer`, `rt.mouse`, `rt.spin`, `rt.stage`). `tests/uses.test.ts` compiles every example and benchmark and fails if the program calls a runtime function it does not import, or imports one it does not call or no block declares. |

### Statements and reporters

`compile` is the handler: a pure function of the block and a `Gen` (`types.ts`), the interface
to the compiler. It reads inputs already cast to the type it needs (`g.num`, `g.str`, `g.bool`,
`g.any`, or `g.input` for the typed expression), fields (`g.field`), variables and lists, and
returns lines of JavaScript for a statement or an `Ex` (code plus its static type) for a reporter.
Returning `undefined` makes that use of the block unsupported, for a block that only handles some
of its options (a `partial` one). Handlers are tested alone against a stub `Gen`
(`packages/compiler/test/helpers.ts`).

A statement also declares how it can yield, which is all `analysis/yields.ts` knows about it:

- `yields: "wait"`: it can wait for a later frame whatever it is given (`wait`, `glide`, `ask`).
  The handler wraps the waiting line in `g.y(...)`, which stores and reloads the variables kept
  in locals around it.
- `yields: "loop"`: a loop, which yields at the end of every iteration outside warp mode
  (`g.loopYield()`), and whose body keeps the variables it uses in locals.
- a function `(block, ctx) => boolean`, for a block whose answer depends on the project; only
  `procedures_call` needs one (a call yields when its callee can).
- `substacks`: the substack inputs it runs, which the analysis follows.

A test runs every handler against the stub and fails if it yields when its spec says it cannot,
or the other way round, or compiles a substack it does not declare. That is what lets a
procedure that never yields compile to a plain function, which is much faster than a generator.

### Hats

A hat spec carries TurboWarp's hat metadata and how Bytecat starts the script:

| Field | Meaning |
| --- | --- |
| `event` | The runtime event that starts it, `Hat.kind` in `@bytecat/runtime`: `flag`, `broadcast`, `key`, `click`. Left out while the hat is missing. |
| `matchField` | The field the event is matched against, ignoring case (TurboWarp's `optMatchFields`): `BROADCAST_OPTION`, `KEY_OPTION`. Its lowercased value becomes `Hat.arg`. |
| `restartExistingThreads` | TurboWarp's rule from `getHats`: whether starting the hat while its script runs restarts the script (flag, broadcast, click, backdrop) or leaves it running and drops the new start (`when key pressed`, `when I start as a clone`, the edge-triggered hats). The compiler passes `false` on to the runtime as `restart: false` on the hat. |
| `edgeActivated` | TurboWarp's edge-triggered hats (`when timer > 10`, `when touching`): the runtime checks a condition every frame and starts the script when it turns true. |
| `predicate` | For an edge-activated hat, the condition, compiled from the hat block's inputs like a reporter. The scheduler cannot check one yet, so an edge-activated hat counts as missing for now. |

`tests/inventory.test.ts` compares `restartExistingThreads` and `edgeActivated` with TurboWarp's
`getHats` for every hat. `procedures_definition` is a hat too (`definesProcedure`): the script
under it compiles to the custom block's function instead of a hat script.

### Menus

A `menu` spec names the field of a shadow menu block (`motion_goto_menu` holds its value in `TO`,
`looks_costume` in `COSTUME`). A menu always compiles: its value is a literal, or whatever
reporter the user dropped into the slot.

A handler reads a menu input with `g.menu(b, "TO")`, the shared resolver. It returns a `MenuEx`:

- When the slot holds its shadow menu, the value is a literal string (`k`) read from the field the
  menu declares. It stays text even when it looks like a number, because a costume or sprite
  named "2" is not number 2. The special values `_mouse_`, `_random_`, `_edge_`, `_stage_` and
  `_myself_` are marked in `special`, so a handler can emit specialised code ("go to mouse
  pointer" reads `rt.mouse` directly instead of looking a sprite up by name), the way TurboWarp
  checks `isConstant('_stage_')`.
- When a reporter was dropped into the slot, the value is that reporter's expression, computed at
  run time and never marked special. Its runtime helper must then recognise the special values
  itself, as TurboWarp's do. This holds even when the reporter folds to a constant: an argument
  reporter outside its custom block stays the number 0, not the text "0".
- A shadow no extension declares, a plain literal or a missing input falls back to `g.input`,
  and the literal it gives is a menu value too.

`switch costume to` and `switch backdrop to` use it. `broadcast` still reads its input with
`g.any`, which passes a broadcast named "1" as the number 1. The behaviour is the same either
way, but switching it would change generated code, so that waits for a PR that changes broadcasts.

## The registry

`ExtensionRegistry` (`extensions/registry.ts`) holds the extensions of one compile and looks every
opcode up by kind. It refuses, with a message per problem, extensions that would make the
inventory lie: an opcode outside its prefix, an id or opcode registered twice, a `missing` block
with a handler, a `compiled` or `partial` one without, a partial or missing block without a note,
a hat the runtime starts without a restart rule, and a loop without a substack.

`builtins` is the registry of `BUILTIN_EXTENSIONS` (`extensions/index.ts`), the extensions
Bytecat ships.

## Adding a block to a built-in extension

1. Find the opcode's entry in `packages/compiler/src/extensions/ID.ts` (every opcode TurboWarp
   knows is already listed) and replace `missing(...)` with `statement(...)`, `reporter(...)` or
   `boolean(...)`, with `yields`, `substacks` and `uses` as they apply. If it does not yet match
   TurboWarp in every case, pass `partial: "what differs"`.
2. Add a handler test in `packages/compiler/test/blocks.test.ts`, and an example or runtime test
   for the behaviour (see `AGENTS.md`).
3. Run `pnpm run docs` to regenerate [blocks.md](blocks.md); `tests/docs.test.ts` fails until you do.

A new built-in extension (`music`, say) is a new file with its `Extension`, added to
`BUILTIN_EXTENSIONS`. The inventory test reads TurboWarp's block modules from the `turbowarp-vm`
dependency (`turbowarpBlocks` in `@bytecat/reference`) and fails if any opcode TurboWarp knows is
not declared, so add the extension's module there too.

## A third-party extension

Pass it to the compiler:

```ts
import { compileProject } from "@bytecat/compiler";

const { code, warnings, unknownExtensions } = compileProject(project, { extensions: [counter] });
```

Its blocks then compile exactly like built-in ones, its hats start like built-in hats, and its
yield declarations feed the procedure analysis. Its ids and opcodes must not clash with the
built-in ones.

A project lists the non-core extensions it uses in project.json's `extensions`. An id that no
registered extension has is reported in `CompileResult.unknownExtensions`, and the CLI and the web
app warn about it; each block of it is also reported as unsupported in `warnings`. Bytecat has no
generic path that runs an extension's own JavaScript: if one is ever added for extensions that
cannot be compiled, it will be reported as a warning and never used for built-in blocks.

**Runtime functions.** A runtime function is a plain function exported from a module: it takes
the runtime, and the target when it needs one, as explicit arguments (`move(rt, t, steps)`,
`coord(n)`), and the generated code calls it by name. The extension's `runtime` is the specifier a
program imports it with; the built-in ones are `@bytecat/runtime/{control,event,looks,motion,
sensing}` and `@bytecat/runtime/ops` for the value helpers of `operator` and `data`. An extension
whose blocks list `uses` must name one, and the registry refuses it otherwise.

`CompileResult.imports` lists, by module, every function a block that compiled declares in `uses`
(or the code generator in `CODEGEN_USES`) and the code then calls; a name a handler declared but
did not emit this time is left out. `toModule` writes the program as an ES module with those
imports, and `load(result, modules)` binds them from the built-in modules plus `modules`, where a
third-party extension's runtime module comes from:

```ts
import * as counterRuntime from "./counter-runtime.js";
const { program } = compile(project, { extensions: [counter], modules: { "./counter-runtime.js": counterRuntime } });
```

## What is not part of the API yet

- `analysis/effects.ts` still knows the variable blocks by opcode (which blocks read or assign the
  variable in their `VARIABLE` field). An extension whose block reads another target's variables
  (`sensing_of`) will declare that in its spec when it lands.
- Edge-triggered hats have room in the spec (`edgeActivated`, `predicate`) but no scheduler support.

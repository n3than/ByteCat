# Bytecat pseudocode (`.sbp`)

Bytecat pseudocode is a small, indentation-based text format that compiles to a real Scratch 3
project (`.sb3`). It exists so that people and agents can write Scratch test projects as plain text,
diff them, and feed them through the Bytecat pipeline without touching the Scratch editor.

Every construct maps to one Scratch block or to a short, documented expansion of a few blocks
(see [Desugaring](#desugaring)). Nothing is hidden: `bytecat dump file.sbp` prints the generated
`project.json`.

```
var count = 0

sprite Cat:
  costume cat = circle "#ffab19"
  position 0, 0

  when flag:
    repeat 3:
      count += 1
      log(join("count is ", count))
    say("done")
```

```sh
pnpm bytecat run examples/hello.sbp          # run on the Bytecat runtime (--engine reference: scratch-vm, --engine turbowarp: TurboWarp), print log() output
pnpm bytecat build examples/hello.sbp        # write examples/hello.sb3
pnpm bytecat build examples -o out/examples  # build every .sbp in a folder
pnpm bytecat bundle examples/hello.sbp       # write out/hello.html, a standalone page that plays the project
pnpm bytecat check my.sbp                    # compile only, report errors
pnpm bytecat dump my.sbp                     # print the generated project.json
```

## Layout

- Indent with **spaces** (tabs are an error). Any consistent width works; two is the convention.
- `#` starts a comment that runs to the end of the line.
- A line ending in `:` opens a block; its body is the following, more indented lines.
- Inside `(...)` and `[...]`, newlines are ignored, so long calls can wrap.

## Top level

A file is a list of **global declarations**, at most one **`stage:`** section, and any number of
**`sprite NAME:`** sections. Sprites are layered in file order (later sprites are drawn on top).

```
var score = 0           # global variable, lives on the stage
list log                # global list, empty
list items = [1, "a"]   # global list with initial items

stage:
  backdrop night "#112244"
  when flag:
    switch_backdrop("night")

sprite Player:          # a sprite; use quotes for names with spaces: sprite "Big Cat":
  ...
```

### Declarations (inside `stage:` or a sprite)

| Syntax | Meaning |
| --- | --- |
| `var NAME = LITERAL` | Variable. In a sprite it is local ("for this sprite only"); in `stage:` or at top level it is global. `= LITERAL` is optional and defaults to `0`. |
| `list NAME` / `list NAME = [LIT, ...]` | List, local or global by the same rule. |
| `costume NAME` | Sprite costume drawn as a built-in shape named `NAME`: `circle`, `square` or `triangle` (48 by 48, rotation center in the middle), or `bar` (96 by 24, rotation center 24, 12). |
| `costume NAME = SHAPE "COLOR"` | Costume called `NAME` using `SHAPE`, with an optional CSS color. The first costume is the starting one. |
| `backdrop NAME "COLOR"` | Stage only: a solid-color 480x360 backdrop. |
| `position X, Y` | Sprite only: starting position (default `0, 0`). |
| `size N` | Sprite only: starting size in percent (default `100`). |
| `direction N` | Sprite only: starting direction in degrees (default `90`). |
| `hidden` | Sprite only: start hidden. |

Literals in declarations must be plain numbers (`3`, `-2.5`) or strings (`"hi"`), not expressions.
A sprite with no costume gets a colored circle; a stage with no backdrop gets a white one.
Names must be unique across a sprite's locals and all globals.

### Scripts

| Syntax | Scratch hat block |
| --- | --- |
| `when flag:` | when green flag clicked |
| `when clicked:` | when this sprite clicked (or when stage clicked, in `stage:`) |
| `when cloned:` | when I start as a clone (sprites only) |
| `when key "space":` | when [space] key pressed |
| `when receive "go":` | when I receive [go] |
| `define NAME(a, b):` | custom block (`define NAME %s %s`) |
| `define warp NAME(a):` | custom block with "run without screen refresh" |
| `define NAME(n, flag: bool):` | parameters are values by default; `: bool` makes a boolean parameter |
| `define NAME(a) -> value:` | custom reporter (TurboWarp only): `return expr` gives the value of a call |
| `define NAME(a) -> bool:` | custom boolean (TurboWarp only), which can be used as a condition |

Procedures are local to the sprite that defines them and can be called before their definition.
Recursion works, but variables are shared between calls, so keep per-call state on a list used
as a stack (see `examples/factorial.sbp`), or in the arguments of a custom reporter.

Custom reporters are a TurboWarp extension of Scratch (the "return" block); scratch-vm cannot run
them. A call to one is an expression, `fib(n - 1) + fib(n - 2)`, and a call to an ordinary
`define` is only a statement. A call reports `""` when its block ends without a `return`. `return`
also works in an ordinary `define`, where it stops the block and the value is dropped, and in a
`when` script, where it stops the script, as in TurboWarp. See `examples/custom_reporters.sbp`.

## Statements

| Syntax | Scratch block |
| --- | --- |
| `x = expr` | set [x] to (expr) |
| `x += expr` | change [x] by (expr) |
| `x -= expr` | change [x] by (0 - expr), or by a negated literal |
| `x *= expr`, `x /= expr` | set [x] to (x * expr), set [x] to (x / expr) |
| `items[i] = expr` | replace item (i) of [items] with (expr) |
| `items.add(expr)` | add (expr) to [items] |
| `items.insert(i, expr)` | insert (expr) at (i) of [items] |
| `items.delete(i)` | delete (i) of [items] |
| `items.clear()` | delete all of [items] |
| `items.show()`, `items.hide()` | show list [items], hide list [items] (the list monitor on the stage, see [Rendering](architecture.md#renderer)) |
| `if cond:` ... `elif cond:` ... `else:` | if / if-else (`elif` nests another if-else in the else branch) |
| `repeat n:` | repeat (n) |
| `repeat until cond:` | repeat until <cond> |
| `while cond:` | repeat until <not cond> |
| `forever:` | forever |
| `all_at_once:` | all at once (hidden Scratch 2 block: runs its body as plain code) |
| `for i = a to b:` | counting loop, see [Desugaring](#desugaring) |
| `name(args)` | a builtin statement (table below) or a call to a `define`d procedure |
| `log(expr)` | add (expr) to the global list `log`; see [Output](#output-and-testing) |
| `return expr` | return (expr) (TurboWarp): leaves a custom block with a value, or stops a `when` script |

`i` in `items[i]` is 1-based, like Scratch. Scratch also accepts `"last"` and `"random"` as indexes.

## Expressions

From lowest to highest precedence:

| Operators | Scratch blocks |
| --- | --- |
| `a or b` | <a or b> |
| `a and b` | <a and b> |
| `not a` | <not a> |
| `a = b` (or `==`), `a < b`, `a > b` | <a = b>, <a < b>, <a > b> |
| `a != b`, `a <= b`, `a >= b` | <not a = b>, <not a > b>, <not a < b> |
| `a + b`, `a - b` | (a + b), (a - b) |
| `a * b`, `a / b`, `a % b` | (a * b), (a / b), (a mod b) |
| `-a` | (0 - a), or a negative literal |
| `f(args)`, `items[i]`, `items.length`, `( ... )` | reporters (builtin or `->` procedures), list item, length of list, grouping |

Comparisons cannot be chained (`1 < x < 5` is an error, write `1 < x and x < 5`).

Values:

| Syntax | Meaning |
| --- | --- |
| `12`, `-3.5`, `0x1f` | number |
| `"text"` | string; escapes `\"`, `\\`, `\n`, `\t` |
| `true`, `false` | In a condition: an always-true block / an empty (false) slot. In a value slot: the text `"true"` / `"false"`. |
| `x` | a variable, or a procedure parameter inside `define` |
| `items` | the list's contents as one value (Scratch joins items with spaces, or with nothing if every item is one character) |
| `items[i]` | item (i) of [items] |
| `items.length` | length of [items] |
| `items.contains(x)` | <[items] contains (x)?> (boolean) |
| `items.index_of(x)` | item # of (x) in [items] |
| `join(a, b, ...)` | join; more than two arguments nest joins |

**Conditions** (`if`, `while`, `repeat until`, `wait_until`, `and`/`or`/`not`, `bool` parameters)
must be boolean expressions: comparisons, `and`/`or`/`not`, `true`/`false`, boolean reporters such
as `key_pressed()`, or boolean parameters. Scratch will not let a round reporter sit in a
hexagonal slot, so `if x:` is an error; write `if x = 1:`.

Arguments to builtins can be any expression. Menu arguments such as the costume in
`switch_costume("ball")` take a literal to fill the menu, or an expression to drop a reporter on it.
`stop(...)` and `rotation_style(...)` only take the literal options listed below.

### Builtins

Zero-argument reporters still need parentheses: `x_position()`, `timer()`.

<!-- builtins:begin (generated by `pnpm run docs`, do not edit by hand) -->

#### Statements

| Pseudocode | Scratch block | Opcode | Where |
| --- | --- | --- | --- |
| `move(steps)` | move (steps) steps | `motion_movesteps` | sprite |
| `turn_right(degrees)` | turn right (degrees) | `motion_turnright` | sprite |
| `turn_left(degrees)` | turn left (degrees) | `motion_turnleft` | sprite |
| `goto(x, y)` | go to x: (x) y: (y) | `motion_gotoxy` | sprite |
| `goto(to)` | go to (`_random_`, `_mouse_` or a sprite name) | `motion_goto` | sprite |
| `glide(secs, x, y)` | glide (secs) secs to x: (x) y: (y) | `motion_glidesecstoxy` | sprite |
| `glide(secs, to)` | glide (secs) secs to (`_random_`, `_mouse_` or a sprite name) | `motion_glideto` | sprite |
| `point_towards(towards)` | point towards (`_mouse_` or a sprite name) | `motion_pointtowards` | sprite |
| `point(direction)` | point in direction (degrees) | `motion_pointindirection` | sprite |
| `change_x(dx)` | change x by (n) | `motion_changexby` | sprite |
| `set_x(x)` | set x to (n) | `motion_setx` | sprite |
| `change_y(dy)` | change y by (n) | `motion_changeyby` | sprite |
| `set_y(y)` | set y to (n) | `motion_sety` | sprite |
| `bounce()` | if on edge, bounce | `motion_ifonedgebounce` | sprite |
| `rotation_style(style)` | set rotation style ["left-right" \| "don't rotate" \| "all around"] | `motion_setrotationstyle` | sprite |
| `say(message)` | say (message) | `looks_say` | sprite |
| `say(message, secs)` | say (message) for (secs) seconds | `looks_sayforsecs` | sprite |
| `think(message)` | think (message) | `looks_think` | sprite |
| `think(message, secs)` | think (message) for (secs) seconds | `looks_thinkforsecs` | sprite |
| `switch_costume(costume)` | switch costume to (name) | `looks_switchcostumeto` | sprite |
| `next_costume()` | next costume | `looks_nextcostume` | sprite |
| `switch_backdrop(backdrop)` | switch backdrop to (name) | `looks_switchbackdropto` | any |
| `next_backdrop()` | next backdrop | `looks_nextbackdrop` | any |
| `change_size(change)` | change size by (n) | `looks_changesizeby` | sprite |
| `set_size(size)` | set size to (n) % | `looks_setsizeto` | sprite |
| `show()` | show | `looks_show` | sprite |
| `hide()` | hide | `looks_hide` | sprite |
| `go_to_front()` | go to front layer | `looks_gotofrontback` | sprite |
| `go_to_back()` | go to back layer | `looks_gotofrontback` | sprite |
| `go_forward(num)` | go forward (n) layers | `looks_goforwardbackwardlayers` | sprite |
| `go_backward(num)` | go backward (n) layers | `looks_goforwardbackwardlayers` | sprite |
| `broadcast(broadcast_input)` | broadcast (message) | `event_broadcast` | any |
| `broadcast_wait(broadcast_input)` | broadcast (message) and wait | `event_broadcastandwait` | any |
| `wait(duration)` | wait (secs) seconds | `control_wait` | any |
| `wait_until(condition)` | wait until <condition> | `control_wait_until` | any |
| `stop(stop_option)` | stop ["all" \| "this script" \| "other scripts in sprite"] | `control_stop` | any |
| `create_clone(clone_option)` | create clone of (`_myself_` or a sprite name) | `control_create_clone_of` | any |
| `create_clone()` | create clone of myself | `control_create_clone_of` | any |
| `delete_clone()` | delete this clone | `control_delete_this_clone` | sprite |
| `incr_counter()` | increment counter (hidden) | `control_incr_counter` | any |
| `clear_counter()` | clear counter (hidden) | `control_clear_counter` | any |
| `ask(question)` | ask (question) and wait | `sensing_askandwait` | any |
| `reset_timer()` | reset timer | `sensing_resettimer` | any |

#### Reporters

| Pseudocode | Scratch block | Opcode | Where |
| --- | --- | --- | --- |
| `random(from, to)` | pick random (from) to (to) | `operator_random` | any |
| `letter(letter, string)` | letter (index) of (text) | `operator_letter_of` | any |
| `length(string)` | length of (text) | `operator_length` | any |
| `contains(string1, string2)` | <(text) contains (part)?> (boolean) | `operator_contains` | any |
| `round(num)` | round (n) | `operator_round` | any |
| `abs(num)` | [abs] of (n) | `operator_mathop` | any |
| `floor(num)` | [floor] of (n) | `operator_mathop` | any |
| `ceiling(num)` | [ceiling] of (n) | `operator_mathop` | any |
| `sqrt(num)` | [sqrt] of (n) | `operator_mathop` | any |
| `sin(num)` | [sin] of (n) | `operator_mathop` | any |
| `cos(num)` | [cos] of (n) | `operator_mathop` | any |
| `tan(num)` | [tan] of (n) | `operator_mathop` | any |
| `asin(num)` | [asin] of (n) | `operator_mathop` | any |
| `acos(num)` | [acos] of (n) | `operator_mathop` | any |
| `atan(num)` | [atan] of (n) | `operator_mathop` | any |
| `ln(num)` | [ln] of (n) | `operator_mathop` | any |
| `log10(num)` | [log] of (n) | `operator_mathop` | any |
| `exp(num)` | [e ^] of (n) | `operator_mathop` | any |
| `pow10(num)` | [10 ^] of (n) | `operator_mathop` | any |
| `x_position()` | x position | `motion_xposition` | sprite |
| `y_position()` | y position | `motion_yposition` | sprite |
| `direction()` | direction | `motion_direction` | sprite |
| `costume_number()` | costume [number] | `looks_costumenumbername` | sprite |
| `costume_name()` | costume [name] | `looks_costumenumbername` | sprite |
| `backdrop_number()` | backdrop [number] | `looks_backdropnumbername` | any |
| `backdrop_name()` | backdrop [name] | `looks_backdropnumbername` | any |
| `size()` | size | `looks_size` | sprite |
| `counter()` | counter (hidden) | `control_get_counter` | any |
| `timer()` | timer | `sensing_timer` | any |
| `answer()` | answer | `sensing_answer` | any |
| `mouse_x()` | mouse x | `sensing_mousex` | any |
| `mouse_y()` | mouse y | `sensing_mousey` | any |
| `mouse_down()` | <mouse down?> (boolean) | `sensing_mousedown` | any |
| `key_pressed(key_option)` | <key (name) pressed?> (boolean) | `sensing_keypressed` | any |
| `touching(touchingobjectmenu)` | <touching (sprite name, `_edge_` or `_mouse_`)?> (boolean) | `sensing_touchingobject` | sprite |
| `attribute_of(property, object)` | [property] of (sprite name or `_stage_`): `"x position"`, `"backdrop name"`, a variable name, ... | `sensing_of` | any |
| `days_since_2000()` | days since 2000 | `sensing_dayssince2000` | any |
| `username()` | username | `sensing_username` | any |

<!-- builtins:end -->

## Desugaring

A few constructs expand into more than one block. These are the only places where the generated
project contains blocks that are not written out one-to-one in the source.

| Pseudocode | Generated blocks |
| --- | --- |
| `for i = a to b:` body | `set i to a`, then `repeat until <i > b>` containing body and `change i by 1`. `b` is re-evaluated every iteration, and `i` must be declared with `var`. |
| `while c:` | `repeat until <not c>` |
| `elif c:` | an `if-else` nested inside the previous `else` |
| `a != b`, `a <= b`, `a >= b` | `not` around `=`, `>`, `<` |
| `x -= e` | `change x by (0 - e)` |
| `x *= e`, `x /= e` | `set x to (x * e)`, `set x to (x / e)` |
| `-e` | `(0 - e)` |
| `join(a, b, c)` | `join a (join b c)` |
| `log(e)` | `add e to [log]` on a global list `log`, created automatically |

## Output and testing

`log(expr)` appends to a global list called `log`. It is the standard way for a test project to
report results, because a list is easy to read back from any Scratch implementation.

`pnpm bytecat run file.sbp` loads the project into the official `scratch-vm` (headless, turbo mode),
clicks the green flag, waits for every script to stop, and prints the `log` list one item per line.
Say and think bubbles are printed to stderr. A project that never stops (for example one with a
`forever` loop and no `stop("all")`) is cut off after `--timeout` milliseconds (default 10000).

Examples live in `examples/NAME.sbp` with the expected `log` output in `examples/NAME.expected`.
`pnpm test` builds each example, validates it against the official sb3 schema, runs it in
scratch-vm and in TurboWarp (compiler on), and compares the output. To add a test project, add both files.
Bytecat follows TurboWarp: where scratch-vm knowingly differs, put scratch-vm's output in
`examples/NAME.scratch.expected` and list the example in `docs/deviations.md`. An example that uses
a TurboWarp-only block scratch-vm cannot run (custom reporters) gets `examples/NAME.scratch.skip`,
a line saying why, instead: it is not run in scratch-vm, and is listed in `docs/deviations.md` too.

Two more optional files test what the canvas shows and how a project reacts to input. They run in
a real browser (`tests/browser.test.ts`: the standalone HTML from `bytecat bundle`, opened with
`?test`, so the clock is virtual and frames advance only when the test steps them).

`examples/NAME.pixels` lists pixel probes checked after the run. One probe per line, `X Y #rrggbb`,
in Scratch stage coordinates (origin at the center, y up). Blank lines and lines starting with `//`
are ignored. A probe passes when each RGB channel is within 8 of the expected value and the pixel
is fully opaque. Pick points well inside shapes, away from the 2px dark outline of built-in shapes.

```
// X Y color
-200 150 #224488
100 100 #00cc00
```

By default the page runs in turbo mode, where a loop runs as many iterations as fit in a frame, so
probes only see the end result. Two more kinds of line make a `.pixels` file check what is on the
canvas at a given frame, with the frame pacing of the live player:

| Line | Effect |
| --- | --- |
| `turbo off` | Open the page with `?test&turbo=off`: a redraw ends the frame, so a loop that moves a visible sprite does one iteration per frame. |
| `frame N` | The probes after this line (up to the next `frame` line) are read right after frame `N`, where frame 1 is the first one stepped after the green flag. A `frame` line applies until the next one, so put the probes checked after the run first. The test fails if the run ends before frame `N`. |

```
turbo off
// checked after the run
200 0 #ff0000
frame 5
// checked right after the fifth frame
-110 0 #ff0000
```

`examples/NAME.input` is scripted input, one command per line, applied in order. Blank lines and
`//` lines are ignored.

| Command | Effect |
| --- | --- |
| `press KEY` | Key goes down. `KEY` is a Scratch key name and may contain spaces: `space`, `a`, `left arrow`. |
| `release KEY` | Key goes up. |
| `click X Y` | Mouse click at stage coordinates: hits the topmost sprite with an opaque pixel there, otherwise the stage. |
| `mouse X Y` | Move the mouse to stage coordinates (`mouse x`, `mouse y`). |
| `answer TEXT` | Answer the next `ask` with the rest of the line (it may be empty). The answer waits until a question is asked; put it before the `ask` runs. |
| `step N` | Advance `N` frames. |

Coordinates for `click` and `mouse` are whole numbers on the stage (X from -240 to 240, Y from
-180 to 180). The same files drive `pnpm bytecat trace --input` ([testing.md](testing.md)), which
applies each command at the same frame on Bytecat and TurboWarp. Headless, a click there always
hits the stage; with `--browser` it hits the sprite under the mouse.

The test clicks the green flag, steps one frame, applies each command followed by one frame (`step N`
runs `N` frames instead), then keeps stepping until every script stops or 10000 frames have passed.
After that it compares the `log` with `NAME.expected` and checks every probe. A project with an
`.input` file must end itself (for example with `stop("all")`) once it has received the input; the
node-only test suites skip these examples because they would wait for input forever.

Headless, the reference VMs get a stand-in renderer and Bytecat measures the costumes, so
fencing, the size limits and `bounce()` work there as in the editor, except that the bounds of a
visible sprite are its costume's box rather than its drawn pixels
([deviations.md](deviations.md#headless-geometry)). Keep touching and pen out of `.expected`
checks. A log that depends on where a visible sprite bounces holds the headless result (as in
`examples/boids`); the browser oracle checks those against TurboWarp with its renderer
(`tests/oracle/`, see [testing.md](testing.md#the-browser-oracle)).

## Errors

Errors give the file, line and column, and point at the problem:

```
demo.sbp:3:5: error: unknown variable 'scroe'. Declare it first with 'var scroe = 0'
      scroe += 1
      ^
```

Unknown builtins suggest the closest name (`mvoe` → `move`).

## Not supported (yet)

Sounds, pen, extensions, sensing that needs a renderer (`touching`, `distance to`,
colors), graphic effects, layers beyond `go_to_front()`, `when backdrop switches`, `when timer >`,
variable and list monitors, and comments.
New blocks are added in `packages/pseudo/src/builtins.ts`; see `AGENTS.md`.

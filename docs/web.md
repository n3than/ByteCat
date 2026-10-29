# Web app

`@bytecat/web` is the user-friendly way to use Bytecat: one HTML page that compiles and plays
projects entirely in the browser, with no server and no install.

```sh
pnpm web                        # writes out/web/index.html; open it in a browser or host it anywhere
pnpm bytecat web -o site/index.html
```

## What it does

- **Open a project.** Drag and drop an `.sb3` (from Scratch or TurboWarp) or an `.sbp` file onto the
  page, use **Open file**, or write pseudocode in the editor. The **Samples** menu loads the welcome
  project (`packages/web/samples/`) and every `examples/*.sbp`.
- **Run it.** **Run** compiles the pseudocode (only when it changed) and clicks the green flag;
  Ctrl+Enter (Cmd+Enter) in the editor does the same. **Stop** stops every script. The stage takes
  keyboard and mouse input, and `ask` shows a text box under it.
- **See what happened.** *Output* lists the `log` list as it grows. *Warnings* names every block
  Bytecat does not support (the compiler skips it) and every costume image the browser could not
  decode (it is not drawn). *JavaScript* shows the generated module. A pseudocode error appears
  under the editor with its line marked in the gutter; click it to jump to the spot.
- **Take it with you.** **Download** saves the standalone player (`.html`, a page like the one
  `bytecat bundle` writes), the `.sb3` (the original file for an opened project), or the
  JavaScript module. The downloaded page carries the full player, with every runtime module,
  since there is no bundler in the browser to leave out the ones the project does not use;
  `bytecat bundle` ships only those.

The editor's text is kept in the browser's local storage, so a reload does not lose work.

## How it is built

`build.ts` (Node) bundles `src/app.ts` with esbuild and inlines it with `app.html` and `app.css`.
Two constants are defined at build time: `__SAMPLES__` (the sample sources) and
`__PLAYER_SCRIPT__` (the full `@bytecat/player` page script, `playerBundle`, which the app embeds
in downloaded standalone pages through `pageHtml`, with the program as `toScript` writes it). The app runs the same packages as the CLI: `@bytecat/pseudo`
and `@bytecat/sb3` to read the source, `@bytecat/compiler` to compile it, and `@bytecat/player` to
play it. Nothing in that path needs Node, which is why `md5` in `@bytecat/sb3` is plain TypeScript.

Each compile gets a fresh player on the same canvas; `Player.dispose()` stops the old frame loop
and removes its input listeners. A start that is still loading costumes when a newer one begins
(Run clicked twice, say) disposes its player instead of installing it. Costume images are passed to the player as blob URLs, and only
the files named by a costume are decoded, so sounds in real projects are ignored.

`window.bytecatApp` exposes the current `player` and compiled project for tests and the console.

## Tests

`packages/web/test/app.test.ts` builds the page, opens it in Chromium and drives it through its
UI: running samples and reading the Output panel, pseudocode errors, opening `.sb3` files (the
`render` example's pixel probes are checked on the app's stage), warnings, drag and drop,
reruns and Run clicked twice at once (only one frame loop may be live), the saved draft, and every download (the downloaded standalone page is run too). It runs
on the real clock and polls for the expected state, so examples it uses must finish quickly. It
also checks that every sample compiles with no unsupported blocks.

// Node side: what esbuild needs to bundle Scratch's own browser code (TurboWarp's scratch-render,
// scratch-vm and scratch-storage), which is written for webpack 4. Those packages use webpack
// loaders in their requires (`raw-loader!`, `ify-loader!`, `worker-loader!`), Node built-ins that
// webpack 4 polyfilled (`events`, `buffer`, `process`), and browserify's fs inlining (`brfs`).
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildOptions, Plugin } from "esbuild";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Node built-ins with a browser package, resolved from this package. */
const POLYFILLS: Record<string, string> = {
  events: require.resolve("events/"),
  buffer: require.resolve("buffer/"),
  url: require.resolve("url/"),
};
/** Node built-ins nothing on the browser path really calls: empty modules. */
const EMPTY = /^(fs|path|os|crypto|util|stream|http|https|zlib|child_process|worker_threads|node:.*)$/;

/**
 * esbuild options for a browser bundle that includes Scratch packages: the plugin below, the
 * `Buffer` and `process` globals, and `global`. Spread them into `build()`.
 */
export function scratchBuildOptions(options: { replace?: Record<string, string> } = {}): Pick<BuildOptions, "plugins" | "inject" | "define" | "loader"> {
  return {
    plugins: [scratchPlugin(options.replace ?? {})],
    // The music extension's instrument samples (webpack's file-loader): left out, nothing plays sound.
    loader: { ".mp3": "empty" },
    inject: [resolve(here, "browser-shims.ts")],
    define: { global: "globalThis", "process.env.NODE_ENV": '"production"' },
  };
}

/**
 * The plugin. `replace` maps the real path of a module file to the source that stands in for it
 * (the trace oracle replaces TurboWarp's `util/uid.js` with a counter, see @bytecat/reference).
 */
export function scratchPlugin(replace: Record<string, string>): Plugin {
  const replaced = new Map(Object.entries(replace).map(([path, source]) => [realpathSync(path), source]));
  return {
    name: "scratch",
    setup(build) {
      // `raw-loader!./shaders/sprite.vert`, `!raw-loader!./renderer.css`: the file as a string.
      build.onResolve({ filter: /^!?raw-loader!/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/^!?raw-loader!/, "")),
        namespace: "raw",
      }));
      build.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({ contents: readFileSync(args.path, "utf8"), loader: "text" }));
      // `base64-loader!./NotoSans-Medium.ttf` (scratch-render-fonts): the file in base64.
      build.onResolve({ filter: /^!?base64-loader!/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/^!?base64-loader!/, "")),
        namespace: "base64",
      }));
      build.onLoad({ filter: /.*/, namespace: "base64" }, (args) => ({
        contents: `module.exports = ${JSON.stringify(readFileSync(args.path).toString("base64"))};`,
        loader: "js",
      }));
      // `!arraybuffer-loader!./builtins/defaultBitmap.png` (scratch-storage): the file as an ArrayBuffer.
      build.onResolve({ filter: /^!?arraybuffer-loader!/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/^!?arraybuffer-loader!/, "")),
        namespace: "arraybuffer",
      }));
      build.onLoad({ filter: /.*/, namespace: "arraybuffer" }, (args) => ({
        contents: `module.exports = Uint8Array.from(atob(${JSON.stringify(readFileSync(args.path).toString("base64"))}), (c) => c.charCodeAt(0)).buffer;`,
        loader: "js",
      }));

      // `!ify-loader!linebreak`: the package itself; its fs reads are inlined below.
      build.onResolve({ filter: /^!?ify-loader!/ }, (args) =>
        build.resolve(args.path.replace(/^!?ify-loader!/, ""), { resolveDir: args.resolveDir, kind: args.kind }),
      );

      // Web workers for extensions and the iframe sandbox: not used by Bytecat's pages.
      build.onResolve({ filter: /^(worker-loader|\.\/tw-load-script-as-plain-text)[?!]/ }, () => ({ path: "worker", namespace: "empty" }));
      build.onResolve({ filter: EMPTY }, (args) => ({ path: args.path, namespace: "empty" }));
      build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "module.exports = {};", loader: "js" }));

      build.onResolve({ filter: /^(events|buffer|url)$/ }, (args) => ({ path: POLYFILLS[args.path]! }));

      // brfs: `fs.readFileSync(__dirname + '/classes.trie'[, 'base64'])` in linebreak and
      // grapheme-breaker becomes the file's contents.
      build.onLoad({ filter: /[\\/](linebreak|grapheme-breaker)[\\/]src[\\/][^\\/]+\.js$/ }, (args) => {
        const dir = dirname(args.path);
        const source = readFileSync(args.path, "utf8").replace(
          /fs\.readFileSync\(__dirname \+ '([^']+)'(, 'base64')?\)/g,
          (_, file: string, base64?: string) => {
            const data = readFileSync(resolve(dir, `.${file}`)).toString("base64");
            return base64 ? JSON.stringify(data) : `Buffer.from(${JSON.stringify(data)}, "base64")`;
          },
        );
        return { contents: source, loader: "js" };
      });

      if (replaced.size > 0) {
        build.onLoad({ filter: /\.js$/ }, (args) => {
          const source = replaced.get(args.path);
          return source === undefined ? undefined : { contents: source, loader: "js" };
        });
      }
    },
  };
}

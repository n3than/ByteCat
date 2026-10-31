// The browser oracle (docs/testing.md): the trace oracle in Chromium, where TurboWarp runs with its
// real renderer (TurboWarp's scratch-render on WebGL) and Bytecat with its scratch-render backend.
// It judges what headless TurboWarp cannot: touching, bounce against the tight bounds of a visible
// costume, clicks on sprites, and fencing and the size limits as scratch-render itself works them out.
//
// - Every example and benchmark must agree, as in the Node oracle (tests/trace.test.ts). Here the
//   renderer requests the redraws and answers fencing, bounce and the size limits, so this also
//   checks the Node oracle's geometry renderer (packages/reference/src/tw-geometry.ts).
// - tests/oracle/*.sbp hold one renderer-dependent behaviour each. Where Bytecat does not match
//   TurboWarp yet, the test pins the first difference the oracle reports (listed in
//   docs/deviations.md, "Found by the browser oracle"); fixing it (Phase 2) makes the test fail
//   until the entry below says `agree`.
// - The renderer backend must place every sprite exactly where TurboWarp's renderer does.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileToSb3 } from "@bytecat/pseudo";
import { describeTrace, parseInput, type FieldDiff, type TraceResult } from "@bytecat/trace";
import { BrowserOracle } from "@bytecat/trace/browser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const sbp = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".sbp"))
    .sort()
    .map((f) => ({ name: f.replace(/\.sbp$/, ""), path: join(root, dir, f) }));

let oracle: BrowserOracle;

beforeAll(async () => {
  oracle = await BrowserOracle.launch();
}, 60_000);

afterAll(async () => {
  await oracle?.close();
});

async function traceFile(path: string, frames = 300, passes?: number): Promise<TraceResult> {
  const inputPath = path.replace(/\.sbp$/, ".input");
  const input = existsSync(inputPath) ? parseInput(readFileSync(inputPath, "utf8"), inputPath) : [];
  return oracle.trace(compileToSb3(readFileSync(path, "utf8"), path), { frames, input, ...(passes ? { passes } : {}) });
}

describe("browser oracle agrees with TurboWarp and its renderer", () => {
  for (const passes of [50, 1]) {
    describe(`with ${passes} passes per frame`, () => {
      for (const dir of ["examples", "bench"]) {
        for (const p of sbp(dir)) {
          it(`${dir}/${p.name}`, async () => {
            const r = await traceFile(p.path, 300, passes);
            expect(r.problems, describeTrace(r)).toEqual([]);
            expect(r.diff, describeTrace(r)).toBeNull();
          });
        }
      }
    });
  }
});

/**
 * What the browser oracle reports for each tests/oracle program: `agree`, or the first difference
 * (Bytecat's value as `actual`, TurboWarp's as `expected`) and any problem it notes.
 */
const KNOWN: Record<string, "agree" | { diff: FieldDiff; problems?: string[] }> = {
  // Fencing: every block that moves a sprite through setXY. Bytecat asks its scratch-render backend
  // (`Runtime.geometry`), so these match, as do bounce (the tight bounds of the visible costume)
  // and the size limits.
  fence_move: "agree",
  fence_goto: "agree",
  fence_glide: "agree",
  fence_change_x: "agree",
  fence_set_x: "agree",
  fence_change_y: "agree",
  fence_set_y: "agree",
  bounce: "agree",
  size_limits: "agree",
  touching: {
    diff: { frame: 8, field: "Stage.var.mouse", actual: "no", expected: "yes" },
    problems: ["bytecat does not support sensing_touchingobject"],
  },
  // Bytecat hit-tests clicks with its scratch-render backend, so these already match.
  click_sprites: "agree",
  backend: "agree",
};

describe("browser oracle on renderer-dependent behaviour (tests/oracle)", () => {
  const programs = sbp("tests/oracle");

  it("has an expectation for every program", () => {
    expect(programs.map((p) => p.name).sort()).toEqual(Object.keys(KNOWN).sort());
  });

  for (const p of programs) {
    it(p.name, async () => {
      const r = await traceFile(p.path);
      const known = KNOWN[p.name];
      if (known === "agree" || known === undefined) {
        expect(r.problems, describeTrace(r)).toEqual([]);
        expect(r.diff, describeTrace(r)).toBeNull();
      } else {
        expect(r.diff, describeTrace(r)).toEqual(known.diff);
        expect(r.problems).toEqual(known.problems ?? []);
      }
    });
  }

  it("sends each click to the sprite drawn under the mouse", async () => {
    const r = await traceFile(join(root, "tests/oracle/click_sprites.sbp"));
    expect(r.expected.fields["Stage.list.log"]).toEqual(["front", "back", "back", "stage"]);
  });

  it("makes TurboWarp's ids from a counter in the page too", async () => {
    expect(await oracle.turbowarpUsesCounterIds()).toBe(true);
  });
});

describe("scratch-render backend", () => {
  // Bounds, fenced positions, costume sizes, touching and what a click hits, after the green flag,
  // and the headless geometry's box, fence and costume sizes.
  for (const path of ["tests/oracle/backend.sbp", "examples/render.sbp", "examples/fence.sbp", "examples/boids.sbp", "tests/oracle/click_sprites.sbp"]) {
    it(`places every sprite like TurboWarp's renderer: ${path}`, async () => {
      const sb3 = compileToSb3(readFileSync(join(root, path), "utf8"), path);
      expect(await oracle.compareBackend(sb3, 2)).toEqual([]);
    });
  }
});

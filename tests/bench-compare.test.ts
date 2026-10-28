// The CI benchmark comparison (scripts/bench-compare.ts): medians over interleaved runs, the 10%
// flag on Bytecat only, and the comment text.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare, FLAGGED_ENGINE, MARKER, median, medians, renderComment, type BenchFile } from "../scripts/bench-compare.ts";

function run(times: Record<string, Record<string, number | "fail">>): BenchFile[] {
  return Object.entries(times).map(([name, engines]) => ({
    name,
    engines: Object.entries(engines).map(([engine, t]) =>
      t === "fail"
        ? { engine, medianMs: 0, correct: false, error: "wrong log" }
        : { engine, medianMs: t, correct: true },
    ),
  }));
}

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
  });
});

describe("medians", () => {
  it("combines the runs per benchmark and engine and skips failed results", () => {
    const m = medians([
      run({ arith: { bytecat: 10, turbowarp: 40 } }),
      run({ arith: { bytecat: 14, turbowarp: "fail" } }),
      run({ arith: { bytecat: 12, turbowarp: 50 } }),
    ]);
    expect(m.get("arith\0bytecat")).toBe(12);
    expect(m.get("arith\0turbowarp")).toBe(45);
  });
});

describe("compare", () => {
  const base = [run({ arith: { bytecat: 10, turbowarp: 40 }, sieve: { bytecat: 20 }, gone: { bytecat: 1 } }), run({ arith: { bytecat: 10, turbowarp: 40 }, sieve: { bytecat: 20 }, gone: { bytecat: 1 } })];

  it("flags a Bytecat median more than 10% slower, and nothing else", () => {
    const head = [
      run({ arith: { bytecat: 11.5, turbowarp: 60 }, sieve: { bytecat: 22 }, fresh: { bytecat: 3 } }),
      run({ arith: { bytecat: 11.5, turbowarp: 60 }, sieve: { bytecat: 22 }, fresh: { bytecat: 3 } }),
    ];
    const c = compare(base, head);
    const row = (name: string, engine: string) => c.rows.find((r) => r.name === name && r.engine === engine)!;
    expect(row("arith", "bytecat").slower).toBe(true);
    expect(row("arith", "bytecat").ratio).toBeCloseTo(1.15);
    // Exactly 10% is not "more than 10%" (22 / 20 = 1.1 up to rounding).
    expect(row("sieve", "bytecat").slower).toBe(false);
    // TurboWarp is 50% slower here, but only the Bytecat engine is flagged.
    expect(row("arith", "turbowarp").slower).toBe(false);
    expect(FLAGGED_ENGINE).toBe("bytecat");
    expect(c.added).toEqual(["fresh"]);
    expect(c.removed).toEqual(["gone"]);
    // New and removed benchmarks have no row, since there is nothing to compare.
    expect(c.rows.map((r) => r.name)).not.toContain("fresh");
    expect(c.rows.map((r) => r.name)).not.toContain("gone");
  });

  it("honours the threshold and reports a faster head without a flag", () => {
    const head = [run({ arith: { bytecat: 8, turbowarp: 40 }, sieve: { bytecat: 21 } })];
    expect(compare(base, head).rows.some((r) => r.slower)).toBe(false);
    expect(compare(base, head, 0.04).rows.filter((r) => r.slower).map((r) => r.name)).toEqual(["sieve"]);
  });

  it("shows a failing head result instead of hiding it", () => {
    const c = compare(base, [run({ arith: { bytecat: "fail", turbowarp: 40 }, sieve: { bytecat: 20 } })]);
    const r = c.rows.find((x) => x.name === "arith" && x.engine === "bytecat")!;
    expect(r.head).toBeUndefined();
    expect(r.slower).toBe(false);
  });
});

describe("renderComment", () => {
  const base = [run({ arith: { bytecat: 10, turbowarp: 40 } })];

  it("starts with the marker that lets CI update one comment, and warns about a slowdown", () => {
    const text = renderComment(compare(base, [run({ arith: { bytecat: 13, turbowarp: 40 } })]), { baseSha: "abcdef0123", headSha: "1234567890", baseRuns: 2, headRuns: 2 });
    expect(text.startsWith(MARKER)).toBe(true);
    expect(text).toContain("| arith | bytecat | 10.0 | 13.0 | **+30.0%** :warning: |");
    expect(text).toContain("| arith | turbowarp | 40.0 | 40.0 | +0.0% |");
    expect(text).toContain("1 Bytecat median is more than 10% slower than main: `arith`");
    expect(text).toContain("`abcdef0`");
    expect(text).toContain("`1234567`");
  });

  it("says so when nothing is slower", () => {
    const text = renderComment(compare(base, [run({ arith: { bytecat: 9, turbowarp: 40 } })]));
    expect(text).toContain("No Bytecat median is more than 10% slower than main.");
    expect(text).toContain("| arith | bytecat | 10.0 | 9.0 | -10.0% |");
    expect(text).not.toContain(":warning:");
  });

  it("says so when there is nothing to compare", () => {
    expect(renderComment(compare([], []))).toContain("Nothing to compare");
  });
});

describe("command line", () => {
  it("writes the comment from result files and exits 0 even when a benchmark got slower", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-compare-"));
    const file = (name: string, data: BenchFile[]) => {
      const path = join(dir, name);
      writeFileSync(path, JSON.stringify(data));
      return path;
    };
    const b1 = file("b1.json", run({ arith: { bytecat: 10 } }));
    const b2 = file("b2.json", run({ arith: { bytecat: 10 } }));
    const h1 = file("h1.json", run({ arith: { bytecat: 20 } }));
    const h2 = file("h2.json", run({ arith: { bytecat: 20 } }));
    const out = join(dir, "comment.md");
    execFileSync(process.execPath, [join(import.meta.dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), join(import.meta.dirname, "..", "scripts", "bench-compare.ts"), "--base", `${b1},${b2}`, "--head", `${h1},${h2}`, "-o", out], { stdio: "pipe" });
    const text = readFileSync(out, "utf8");
    expect(text).toContain("**+100.0%** :warning:");
  });
});

// The CI benchmark comparison (scripts/bench-compare.ts): medians over interleaved runs, the 10%
// flag on Bytecat only, and the comment text.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare, FLAGGED_ENGINE, MARKER, median, medians, quantile, renderComment, spread, type BenchFile } from "../scripts/bench-compare.ts";

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

/** Several rounds of one Bytecat benchmark, one file each. */
const rounds = (times: number[]) => times.map((t) => run({ arith: { bytecat: t } }));

describe("quantile and spread", () => {
  it("interpolates between rounds", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(quantile([4, 1, 3, 2], 0.25)).toBeCloseTo(1.75);
    expect(quantile([7], 0.75)).toBe(7);
    expect(spread([9, 8, 12, 10, 11])).toEqual({ n: 5, min: 8, q1: 9, median: 10, q3: 11, max: 12 });
    expect(spread([])).toBeUndefined();
  });
});

describe("flagging against round-to-round noise", () => {
  // Rounds are separate processes and vary by 25% or more, so a median 15% up is not a regression
  // when the rounds overlap.
  const base = rounds([10, 12, 8, 11, 9]);
  const row = (head: BenchFile[][]) => compare(base, head).rows[0]!;

  it("does not flag a median over the threshold while the spreads overlap, and says so", () => {
    const r = row(rounds([11.5, 13, 10.5, 12, 9.5]));
    expect(r.ratio).toBeCloseTo(1.15);
    // Head Q1 is 10.5, base Q3 is 11.
    expect(r.slower).toBe(false);
    expect(r.withinNoise).toBe(true);
    expect(renderComment(compare(base, rounds([11.5, 13, 10.5, 12, 9.5])))).toContain("+15.0% (within noise)");
  });

  it("flags it once the head's fast quarter of rounds is slower than the base's slow quarter", () => {
    const r = row(rounds([12, 13, 12.5, 14, 13]));
    // Head Q1 is 12.5, base Q3 is 11.
    expect(r.slower).toBe(true);
    expect(r.withinNoise).toBe(false);
  });

  it("does not flag unchanged code however the rounds scatter", () => {
    for (const head of [rounds([8, 9, 10, 11, 12]), rounds([12, 11, 10, 9, 8]), rounds([9, 12, 8, 10, 11]), rounds([11, 11, 11, 11, 11])]) {
      expect(row(head).slower).toBe(false);
    }
  });

  it("needs the spreads strictly apart: a head Q1 equal to the base Q3 is not flagged", () => {
    // Base Q3 is 11; head rounds with Q1 exactly 11 and a median more than 10% over 10.
    const r = row(rounds([11, 11, 12, 13, 14]));
    expect(r.ratio).toBeCloseTo(1.2);
    expect(r.headSpread!.q1).toBe(11);
    expect(r.slower).toBe(false);
  });

  it("flags a clear slowdown with a single round on each side, as before", () => {
    expect(compare(rounds([10]), rounds([13])).rows[0]!.slower).toBe(true);
    expect(compare(rounds([10]), rounds([10.5])).rows[0]!.slower).toBe(false);
  });

  it("uses the rounds each row has when engines come from different files", () => {
    const mixed = (bytecat: number[], turbowarp: number[]) => [
      ...bytecat.map((t) => run({ arith: { bytecat: t } })),
      ...turbowarp.map((t) => run({ arith: { turbowarp: t } })),
    ];
    const c = compare(mixed([10, 11, 12, 10], [40, 41]), mixed([10, 11, 12, 10], [40, 44]));
    const byEngine = (e: string) => c.rows.find((r) => r.engine === e)!;
    expect(byEngine("bytecat").baseSpread!.n).toBe(4);
    expect(byEngine("turbowarp").baseSpread!.n).toBe(2);
    expect(renderComment(c)).toContain("Rounds per side (interleaved, each a separate process): bytecat 4, turbowarp 2.");
  });
});

describe("renderComment", () => {
  const base = [run({ arith: { bytecat: 10, turbowarp: 40 } })];

  it("starts with the marker that lets CI update one comment, and warns about a slowdown", () => {
    const text = renderComment(compare(base, [run({ arith: { bytecat: 13, turbowarp: 40 } })]), { baseSha: "abcdef0123", headSha: "1234567890" });
    expect(text.startsWith(MARKER)).toBe(true);
    expect(text).toContain("| arith | bytecat | 10.0 | 13.0 | **+30.0%** :warning: | 10.0\u201310.0 | 13.0\u201313.0 |");
    expect(text).toContain("| arith | turbowarp | 40.0 | 40.0 | +0.0% | 40.0\u201340.0 | 40.0\u201340.0 |");
    expect(text).toContain("1 Bytecat median is more than 10% slower than main, beyond the noise between rounds: `arith`");
    expect(text).toContain("`abcdef0`");
    expect(text).toContain("`1234567`");
  });

  it("puts a wrong log on the head in the headline, ahead of any slowdown claim", () => {
    const text = renderComment(compare(base, [run({ arith: { bytecat: "fail", turbowarp: 40 } })]));
    const headline = text.split("\n").slice(0, 6).join("\n");
    expect(headline).toContain(":x: Bytecat gave a wrong log or did not finish: `arith` on head.");
    expect(text).not.toContain("No Bytecat median is more than");
    expect(text).toContain("| arith | bytecat | 10.0 | FAIL | FAIL on head | 10.0\u201310.0 | n/a |");
  });

  it("names the base when the failure is there, and ignores a failing reference engine", () => {
    const failedBase = [run({ arith: { bytecat: "fail", turbowarp: 40 } })];
    expect(renderComment(compare(failedBase, [run({ arith: { bytecat: 9, turbowarp: 40 } })]))).toContain("`arith` on base.");
    // Only Bytecat failures are in the headline; a TurboWarp one shows in the table.
    const text = renderComment(compare(base, [run({ arith: { bytecat: 10, turbowarp: "fail" } })]));
    expect(text).not.toContain(":x:");
    expect(text).toContain("| arith | turbowarp | 40.0 | FAIL | FAIL on head | 40.0\u201340.0 | n/a |");
  });

  it("says so when nothing is slower", () => {
    const text = renderComment(compare(base, [run({ arith: { bytecat: 9, turbowarp: 40 } })]));
    expect(text).toContain("No Bytecat median is more than 10% slower than main beyond the noise between rounds.");
    expect(text).toContain("| arith | bytecat | 10.0 | 9.0 | -10.0% | 10.0\u201310.0 | 9.0\u20139.0 |");
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
    const root = join(import.meta.dirname, "..");
    execFileSync("pnpm", ["exec", "tsx", "scripts/bench-compare.ts", "--base", `${b1},${b2}`, "--head", `${h1},${h2}`, "-o", out], { cwd: root, stdio: "pipe" });
    const text = readFileSync(out, "utf8");
    expect(text).toContain("**+100.0%** :warning:");
  });
});

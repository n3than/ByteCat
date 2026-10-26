// The fuzzer command: `pnpm fuzz [--count N] [--seed S] [--also-scratch]`. See docs/fuzzing.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { describeFailure, failed, fuzzOne, type FuzzResult } from "./run.js";

const USAGE = `Usage: pnpm fuzz [--count N] [--seed S] [--also-scratch] [--out DIR]

Generates N random programs (seeds S, S+1, ...), runs each on Bytecat and TurboWarp and compares
their log() output. TurboWarp is the ground truth. Exits with code 1 on any mismatch.

  --count N         number of programs (default 200)
  --seed S          first seed (default 1)
  --also-scratch    also run scratch-vm and report where it disagrees with TurboWarp (informational)
  --out DIR         where failing programs are written as seed-N.sbp (default out/fuzz)
`;

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "200" },
    seed: { type: "string", default: "1" },
    "also-scratch": { type: "boolean" },
    out: { type: "string", default: "out/fuzz" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const count = Number(values.count);
const first = Number(values.seed);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(first) || first < 0) {
  console.error(USAGE);
  process.exit(2);
}
const alsoScratch = values["also-scratch"] ?? false;

const failures: FuzzResult[] = [];
const scratchDiffs: FuzzResult[] = [];
const started = performance.now();

for (let i = 0; i < count; i++) {
  const seed = first + i;
  let result: FuzzResult;
  try {
    result = await fuzzOne(seed, { scratch: alsoScratch });
  } catch (e) {
    // The generator promises valid pseudocode; a throw here is a bug in the fuzzer itself.
    console.error(`seed ${seed}: the fuzzer itself failed: ${e instanceof Error ? e.stack : String(e)}`);
    process.exitCode = 1;
    continue;
  }
  if (failed(result)) {
    failures.push(result);
    mkdirSync(values.out, { recursive: true });
    writeFileSync(join(values.out, `seed-${seed}.sbp`), result.source);
    console.log(`\nMISMATCH ${describeFailure(result)}\n`);
  }
  if (result.scratchDiff) scratchDiffs.push(result);
  if ((i + 1) % 50 === 0 || i + 1 === count) {
    console.log(`[${i + 1}/${count}] seeds ${first}..${seed}, ${failures.length} mismatches`);
  }
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\nSummary: ${count} programs (seeds ${first}..${first + count - 1}) in ${seconds} s`);
console.log(`  bytecat vs turbowarp: ${count - failures.length} agree, ${failures.length} differ`);
if (failures.length) {
  console.log(`  failing seeds: ${failures.map((f) => f.seed).join(" ")}`);
  console.log(`  programs written to ${values.out}/seed-<n>.sbp`);
}
if (alsoScratch) {
  console.log(`  scratch-vm vs turbowarp (informational): ${count - scratchDiffs.length} agree, ${scratchDiffs.length} differ`);
  for (const r of scratchDiffs.slice(0, 20)) {
    const d = r.scratchDiff!;
    const show = (v: string | undefined) => (v === undefined ? "<missing>" : JSON.stringify(v));
    console.log(`    seed ${r.seed}: log line ${d.index}: scratch-vm ${show(d.bytecat)} but turbowarp ${show(d.other)}`);
  }
  if (scratchDiffs.length > 20) console.log(`    ... and ${scratchDiffs.length - 20} more`);
}
process.exit(failures.length ? 1 : process.exitCode ?? 0);

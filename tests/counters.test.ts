// The hidden counter (docs/blocks.md): one number per runtime, never reset by the green flag or by
// stop. TurboWarp only clears it when the runtime is disposed, and Bytecat follows. A project
// cannot click the green flag itself, so the restarts are driven here, on both engines.
import { compileToSb3 } from "@bytecat/pseudo";
import { readSb3 } from "@bytecat/sb3";
import { BytecatLockstep, TurboWarpEngine, type LockstepEngine } from "@bytecat/trace";
import { describe, expect, it } from "vitest";

const source = `
sprite A:
  when flag:
    incr_counter()
    incr_counter()
    log(counter())

sprite B:
  when flag:
    wait(0.1)
    incr_counter()
    log(counter())
`;

async function settle(engine: LockstepEngine): Promise<void> {
  for (let i = 0; i < 100 && engine.running; i++) await engine.step();
}

const log = (engine: LockstepEngine) => engine.snapshot(0).fields["Stage.list.log"];

/** The log after the first run, after a second green flag, and after stop followed by a third. */
async function restarts(engine: LockstepEngine, flag: () => void, stop: () => void): Promise<string[][]> {
  const seen: string[][] = [];
  await settle(engine);
  seen.push([...log(engine)!]);
  flag();
  await settle(engine);
  seen.push([...log(engine)!]);
  stop();
  flag();
  await settle(engine);
  seen.push([...log(engine)!]);
  engine.dispose();
  return seen;
}

// Each run adds 3 (two increments in A, one in B); a reset would show 2 and 3 again.
const counting = [
  ["2", "3"],
  ["2", "3", "5", "6"],
  ["2", "3", "5", "6", "8", "9"],
];

describe("the counter across green flag restarts", () => {
  const sb3 = compileToSb3(source, "counters-restart.sbp");

  it("keeps counting on TurboWarp", async () => {
    const tw = await TurboWarpEngine.load(sb3);
    expect(await restarts(tw, () => tw.tw.vm.greenFlag(), () => tw.tw.vm.stopAll())).toEqual(counting);
  });

  it("keeps counting on Bytecat, as TurboWarp does", async () => {
    const bytecat = new BytecatLockstep(readSb3(sb3).json);
    expect(await restarts(bytecat, () => bytecat.rt.greenFlag(), () => bytecat.rt.stopAll())).toEqual(counting);
    expect(bytecat.rt.counter).toBe(9);
  });
});

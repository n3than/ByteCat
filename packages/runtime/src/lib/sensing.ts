import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { WAIT } from "../thread.js";
import { say } from "./looks.js";

export function timer(rt: Runtime): number {
  return (rt.now() - rt.timerStart) / 1000;
}

export function resetTimer(rt: Runtime): void {
  rt.timerStart = rt.now();
}

export function* ask(rt: Runtime, t: Target, question: Value): Generator<unknown, void, unknown> {
  if (!t.isStage) say(rt, t, "say", question);
  if (rt.onAsk) {
    let result: string | null = null;
    rt.onAsk(ops.toStr(question)).then((a) => (result = a));
    while (result === null) yield WAIT;
    rt.answer = result;
  } else {
    rt.answer = rt.answers.shift() ?? "";
    yield WAIT;
  }
  if (!t.isStage) say(rt, t, "say", "");
}

export function keyPressed(rt: Runtime, key: Value): boolean {
  const k = ops.toStr(key).toLowerCase();
  if (k === "any") return rt.keys.size > 0;
  return rt.keys.has(k);
}

export function daysSince2000(): number {
  return (Date.now() - Date.UTC(2000, 0, 1)) / 86_400_000;
}

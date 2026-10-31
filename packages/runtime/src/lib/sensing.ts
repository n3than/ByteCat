import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { BLOCKED } from "../thread.js";
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
    while (result === null) yield BLOCKED;
    rt.answer = result;
  } else {
    // A queued answer arrives in the next frame, as an answer does in TurboWarp.
    rt.answer = rt.answers.shift() ?? "";
    const frame = rt.frame;
    do yield BLOCKED;
    while (rt.frame === frame);
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

/**
 * `[property] of [object]` with an object known only at run time, as TurboWarp's
 * `getAttributeOf`: `_stage_` or a sprite's original by name, a built-in property or the
 * variable of that name the object owns, and 0 for anything else. Volume is 100 until sound exists.
 */
export function attributeOf(rt: Runtime, object: Value, property: string): Value {
  const name = ops.toStr(object);
  const of = object === "_stage_" ? rt.stage : rt.targets.find((x) => !x.isStage && x.name === name);
  if (!of) return 0;
  if (of.isStage) {
    switch (property) {
      case "background #":
      case "backdrop #": return of.costume + 1;
      case "backdrop name": return of.costumes[of.costume]!.name;
      case "volume": return 100;
    }
  } else {
    switch (property) {
      case "x position": return of.x;
      case "y position": return of.y;
      case "direction": return of.direction;
      case "costume #": return of.costume + 1;
      case "costume name": return of.costumes[of.costume]!.name;
      case "size": return of.size;
      case "volume": return 100;
    }
  }
  const variables = rt.project.targets[of.index]!.variables;
  for (const id in variables) if (variables[id]![0] === property && id in of.v) return of.v[id]!;
  return 0;
}

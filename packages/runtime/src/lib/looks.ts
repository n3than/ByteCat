import * as ops from "../ops.js";
import type { Value } from "../ops.js";
import type { Runtime } from "../runtime.js";
import type { Target } from "../target.js";
import { wait } from "./control.js";

export function say(rt: Runtime, t: Target, kind: "say" | "think", text: Value): void {
  const s = ops.toStr(text);
  t.bubble = s === "" ? null : { kind, text: s };
  if (s !== "") rt.says.push({ target: t.name, kind, text: s });
  rt.requestRedraw();
}

export function* sayFor(
  rt: Runtime,
  t: Target,
  kind: "say" | "think",
  text: Value,
  seconds: number,
): Generator<unknown, void, unknown> {
  say(rt, t, kind, text);
  const bubble = t.bubble;
  yield* wait(rt, seconds);
  if (t.bubble === bubble) say(rt, t, kind, "");
}

export function switchCostume(rt: Runtime, t: Target, value: Value): void {
  const i = t.costumes.findIndex((c) => c.name === value);
  if (i >= 0) t.costume = i;
  else if (value === "next costume" || value === "next backdrop") t.costume = (t.costume + 1) % t.costumes.length;
  else if (value === "previous costume" || value === "previous backdrop") t.costume = ops.mod(t.costume - 1, t.costumes.length);
  else if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    t.costume = ops.mod(Math.round(ops.toNum(value)) - 1, t.costumes.length);
  }
  rt.requestRedraw();
}

export function nextCostume(rt: Runtime, t: Target): void {
  t.costume = (t.costume + 1) % t.costumes.length;
  rt.requestRedraw();
}

export function costumeName(t: Target): string {
  return t.costumes[t.costume]?.name ?? "";
}

export function setSize(rt: Runtime, t: Target, size: number): void {
  t.size = Math.max(5, size);
  if (t.visible) rt.requestRedraw();
}

export function setVisible(rt: Runtime, t: Target, visible: boolean): void {
  t.visible = visible;
  rt.requestRedraw();
}

export function goToFront(rt: Runtime, t: Target): void {
  const top = Math.max(...rt.targets.map((x) => x.layer));
  if (t.layer !== top) {
    t.layer = top + 1;
    rt.ordered = null;
  }
  rt.requestRedraw();
}

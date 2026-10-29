// Scripted input: the `.input` format of docs/pseudocode.md ("Output and testing"), shared by the
// browser test and the trace oracle. No Node imports.
//
// Commands run in order. Frame 1 runs right after the green flag with no input; then each command
// is applied just before the next frame, and `step N` lets N frames run without input.

export type Command =
  | { op: "press" | "release"; key: string }
  | { op: "click" | "mouse"; x: number; y: number }
  | { op: "answer"; text: string }
  | { op: "step"; n: number };

/** A command and the frame it is applied before (frame 2 is the first that can see input). */
export interface InputEvent {
  frame: number;
  command: Exclude<Command, { op: "step" }>;
}

const USAGE = "expected press KEY, release KEY, click X Y, mouse X Y, answer TEXT or step N";

/**
 * Whole stage coordinates, as a player on a canvas delivers them: TurboWarp clamps the mouse to the
 * stage and rounds it to 3 decimals, a player rounds to whole numbers, so only these mean the same
 * on every engine.
 */
function point(rest: string[]): { x: number; y: number } | null {
  if (rest.length !== 2) return null;
  const [x, y] = rest.map(Number) as [number, number];
  const whole = Number.isInteger(x) && Number.isInteger(y);
  return whole && Math.abs(x) <= 240 && Math.abs(y) <= 180 ? { x, y } : null;
}

/** Parses an `.input` file. `file` names it in error messages. */
export function parseInput(text: string, file = "input"): Command[] {
  const commands: Command[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) return;
    const [op = "", ...rest] = line.split(/\s+/);
    const at = op === "click" || op === "mouse" ? point(rest) : null;
    if ((op === "press" || op === "release") && rest.length > 0) commands.push({ op, key: rest.join(" ") });
    else if ((op === "click" || op === "mouse") && at) commands.push({ op, ...at });
    else if (op === "click" || op === "mouse") {
      throw new Error(`${file}:${i + 1}: bad input command "${line}" (${op} takes whole stage coordinates: X from -240 to 240, Y from -180 to 180)`);
    }
    // The answer is the rest of the line after one space, so it may contain spaces (or be empty).
    else if (op === "answer") commands.push({ op, text: line.slice("answer".length).replace(/^\s/, "") });
    else if (op === "step" && rest.length === 1 && Number.isInteger(Number(rest[0])) && Number(rest[0]) >= 0) {
      commands.push({ op, n: Number(rest[0]) });
    } else {
      throw new Error(`${file}:${i + 1}: bad input command "${line}" (${USAGE})`);
    }
  });
  return commands;
}

/** When each command applies, and the last frame the script reaches. */
export function schedule(commands: readonly Command[]): { events: InputEvent[]; lastFrame: number } {
  const events: InputEvent[] = [];
  let frame = 1;
  for (const command of commands) {
    if (command.op === "step") {
      frame += command.n;
    } else {
      frame++;
      events.push({ frame, command });
    }
  }
  return { events, lastFrame: frame };
}

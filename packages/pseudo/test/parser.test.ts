import { describe, expect, it } from "vitest";
import { parse, PseudoError } from "../src/index.js";

function errorOf(source: string): PseudoError {
  try {
    parse(source);
  } catch (e) {
    if (e instanceof PseudoError) return e;
    throw e;
  }
  throw new Error("expected a parse error");
}

describe("parser", () => {
  it("parses globals, sprites and scripts", () => {
    const program = parse(`var score = 0\nsprite Cat:\n  when flag:\n    score += 1\n`);
    expect(program.globals).toHaveLength(1);
    expect(program.targets[0]!.name).toBe("Cat");
    expect(program.targets[0]!.scripts[0]!.body[0]).toMatchObject({ kind: "assign", op: "+=", target: "score" });
  });

  it("gives * and / higher precedence than + and -", () => {
    const program = parse(`sprite A:\n  when flag:\n    log(1 + 2 * 3)\n`);
    const stmt = program.targets[0]!.scripts[0]!.body[0]!;
    expect(stmt).toMatchObject({
      kind: "call",
      args: [{ kind: "binary", op: "+", right: { kind: "binary", op: "*" } }],
    });
  });

  it("turns elif into a nested if", () => {
    const program = parse(`sprite A:\n  when flag:\n    if 1 < 2:\n      log(1)\n    elif 2 < 3:\n      log(2)\n    else:\n      log(3)\n`);
    const stmt = program.targets[0]!.scripts[0]!.body[0]!;
    expect(stmt).toMatchObject({ kind: "if", else: [{ kind: "if", else: [{ kind: "call" }] }] });
  });

  it("lets calls wrap across lines inside parentheses", () => {
    const program = parse(`sprite A:\n  when flag:\n    log(join(\n      "a",\n      "b"))\n`);
    expect(program.targets[0]!.scripts[0]!.body).toHaveLength(1);
  });

  it("reports the line and column of errors", () => {
    const e = errorOf(`sprite A:\n  when flag:\n    log(1 +)\n`);
    expect(e.pos).toEqual({ line: 3, col: 12 });
    expect(e.message).toMatch(/expected an expression/);
  });

  it("rejects statements outside scripts", () => {
    expect(errorOf(`sprite A:\n  move(10)\n`).message).toMatch(/must be inside a 'when' or 'define'/);
  });

  it("rejects chained comparisons", () => {
    expect(errorOf(`sprite A:\n  when flag:\n    log(1 < 2 < 3)\n`).message).toMatch(/cannot be chained/);
  });

  it("rejects tabs", () => {
    expect(errorOf(`sprite A:\n\twhen flag:\n`).message).toMatch(/tabs/);
  });
});

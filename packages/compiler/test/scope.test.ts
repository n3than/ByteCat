import type { Target } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { Scope } from "../src/scope.js";
import { target } from "./helpers.js";

const withVars = (variables: Record<string, [string, unknown]>, lists: Record<string, [string, unknown[]]> = {}) =>
  target({}, { variables, lists } as unknown as Partial<Target>);

describe("Scope", () => {
  it("prefers the sprite, then the stage, by id", () => {
    const prelude: string[] = [];
    const scope = new Scope(withVars({ a: ["x", 0] }), withVars({ b: ["y", 0] }), prelude);
    expect(scope.variable(["x", "a"])).toBe('t.v["a"]');
    expect(scope.variable(["y", "b"])).toBe('S.v["b"]');
    expect(prelude).toEqual([]);
  });

  it("falls back to the name when the id is stale", () => {
    const scope = new Scope(withVars({ a: ["x", 0] }), withVars({}), []);
    expect(scope.variable(["x", "old"])).toBe('t.v["a"]');
  });

  it("creates unknown variables and lists on the stage once", () => {
    const prelude: string[] = [];
    const scope = new Scope(withVars({}), withVars({}), prelude);
    expect(scope.variable(["x", "id1"])).toBe('S.v["id1"]');
    expect(scope.variable(["x", "id1"])).toBe('S.v["id1"]');
    expect(scope.list(["l", null])).toBe('S.l["missing:l"]');
    expect(prelude).toEqual([
      'if (!("id1" in S.v)) S.v["id1"] = 0;',
      'if (!("missing:l" in S.l)) S.l["missing:l"] = [];',
    ]);
  });
});

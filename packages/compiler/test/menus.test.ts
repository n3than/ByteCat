import type { Block, Input } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";
import { MENU_SPECIALS, compileProject, statement, type Extension, type MenuEx } from "../src/index.js";
import { block, project, target } from "./helpers.js";

/** An extension whose one block records what the menu resolver gives for its TO input. */
function probe(seen: MenuEx[]): Extension {
  return {
    id: "probe",
    name: "Probe",
    blocks: {
      probe_go: statement((b, g) => {
        const e = g.menu(b, "TO");
        seen.push(e);
        return [`go(${e.c});`];
      }),
    },
  };
}

/** Compiles a flag script with one `probe_go` whose TO input is `to`, plus the given blocks. */
function resolve(to: Input | undefined, blocks: Record<string, Block> = {}, variables = {}): MenuEx & { code: string } {
  const seen: MenuEx[] = [];
  const all = {
    hat: block("event_whenflagclicked", { topLevel: true, next: "go" }),
    go: block("probe_go", { inputs: to ? { TO: to } : {} }),
    ...blocks,
  };
  const { code } = compileProject(project(target(all, { variables })), { extensions: [probe(seen)] });
  return { ...seen.at(-1)!, code };
}

const shadow = (opcode: string, field: string, value: string) => block(opcode, { shadow: true, fields: { [field]: [value, null] } });

describe("the menu resolver", () => {
  it("gives a constant shadow menu as a string literal", () => {
    const e = resolve([1, "m"], { m: shadow("motion_goto_menu", "TO", "Cat") });
    expect(e).toMatchObject({ c: '"Cat"', k: "Cat", text: true });
    expect(e.special).toBeUndefined();
  });

  it("keeps a name that looks like a number as text", () => {
    expect(resolve([1, "m"], { m: shadow("looks_costume", "COSTUME", "2") })).toMatchObject({ c: '"2"', k: "2", text: true });
  });

  it("marks the special values", () => {
    for (const special of MENU_SPECIALS) {
      expect(resolve([1, "m"], { m: shadow("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", special) }).special).toBe(special);
    }
  });

  it("reads the field the menu declares", () => {
    const m = block("sensing_of_object_menu", { shadow: true, fields: { OTHER: ["no", null], OBJECT: ["_stage_", null] } });
    expect(resolve([1, "m"], { m })).toMatchObject({ k: "_stage_", special: "_stage_" });
  });

  it("compiles a reporter dropped into the slot, and never marks it special", () => {
    const e = resolve([3, "r", "m"], {
      r: block("data_variable", { fields: { VARIABLE: ["where", "var_0"] } }),
      m: shadow("motion_goto_menu", "TO", "_mouse_"),
    }, { var_0: ["where", "_mouse_"] });
    expect(e.code).toContain('go(t.v["var_0"]);');
    expect(e.k).toBeUndefined();
    expect(e.special).toBeUndefined();
  });

  it("keeps a reporter's constant result as it is, not as menu text", () => {
    // An argument reporter outside its custom block is the number 0, as in TurboWarp.
    const e = resolve([3, "r", "m"], {
      r: block("argument_reporter_string_number", { fields: { VALUE: ["n", null] } }),
      m: shadow("motion_goto_menu", "TO", "Cat"),
    });
    expect(e).toMatchObject({ k: "0" });
    expect(e.text).toBeUndefined();
    expect(e.special).toBeUndefined();
  });

  it("falls back to the input for a shadow no extension declares, and for a missing input", () => {
    expect(resolve([1, "m"], { m: shadow("other_menu", "X", "_random_") })).toMatchObject({ k: "_random_", special: "_random_" });
    expect(resolve(undefined)).toMatchObject({ c: '""', k: "" });
    expect(resolve([1, [10, "7"]])).toMatchObject({ c: '"7"', k: "7" });
  });
});

// The block inventory (every opcode an extension declares, with its status) is checked against
// what TurboWarp itself knows: its core block modules and the Pen extension, read from the
// turbowarp-vm dependency. docs/blocks.md is generated from the same specs (tests/docs.test.ts).
import { BUILTIN_EXTENSIONS, builtins, checkExtension, compiles } from "@bytecat/compiler";
import { turbowarpBlocks } from "@bytecat/reference";
import { describe, expect, it } from "vitest";

const turbowarp = turbowarpBlocks();
const twOpcodes = new Set(turbowarp.flatMap((m) => [...m.primitives, ...Object.keys(m.hats)]));
const twHats = Object.assign({}, ...turbowarp.map((m) => m.hats)) as Record<string, { restartExistingThreads?: boolean; edgeActivated?: boolean }>;

describe("block inventory", () => {
  it("reads TurboWarp's block modules", () => {
    expect(turbowarp.map((m) => m.module)).toContain("pen");
    expect(twOpcodes.has("motion_movesteps")).toBe(true);
    expect(twOpcodes.has("pen_penDown")).toBe(true);
    expect(twHats.event_whenkeypressed).toEqual({ restartExistingThreads: false });
  });

  it("lists every opcode TurboWarp knows", () => {
    const unlisted = [...twOpcodes].filter((op) => builtins.spec(op) === undefined).sort();
    expect(unlisted, "add these to their extension in packages/compiler/src/extensions/").toEqual([]);
  });

  it("lists nothing TurboWarp does not know, except the shadow menus", () => {
    const extra = BUILTIN_EXTENSIONS.flatMap((e) => Object.entries(e.blocks))
      .filter(([op, spec]) => spec.kind !== "menu" && !twOpcodes.has(op))
      .map(([op]) => op);
    expect(extra).toEqual([]);
  });

  it("declares every hat as a hat with TurboWarp's restart and edge rules", () => {
    for (const [op, meta] of Object.entries(twHats)) {
      const spec = builtins.hat(op);
      expect(spec, op).toBeDefined();
      expect(spec!.restartExistingThreads, op).toBe(meta.restartExistingThreads);
      expect(spec!.edgeActivated ?? false, op).toBe(meta.edgeActivated ?? false);
    }
  });

  it("has statuses that agree with the handler tables", () => {
    for (const e of BUILTIN_EXTENSIONS) {
      expect(checkExtension(e), e.id).toEqual([]);
      for (const [op, spec] of Object.entries(e.blocks)) {
        const handled = Object.hasOwn(builtins.statements, op) || Object.hasOwn(builtins.reporters, op);
        if (spec.kind === "statement" || spec.kind === "reporter" || spec.kind === "boolean") {
          expect(handled, `${op} is ${spec.status}`).toBe(spec.status !== "missing");
        } else {
          expect(handled, op).toBe(false);
          expect(compiles(spec), `${op} is ${spec.status}`).toBe(spec.status !== "missing");
        }
      }
    }
  });
});

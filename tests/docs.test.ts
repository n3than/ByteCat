import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { updatedDoc } from "../scripts/gen-docs.ts";

it("docs/pseudocode.md builtin tables match builtins.ts (run `pnpm docs` to fix)", () => {
  const doc = readFileSync(join(import.meta.dirname, "..", "docs", "pseudocode.md"), "utf8");
  expect(updatedDoc(doc)).toBe(doc);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { BLOCKS_DOC, renderBlocksDoc, updatedDoc } from "../scripts/gen-docs.ts";

it("docs/pseudocode.md builtin tables match builtins.ts (run `pnpm run docs` to fix)", () => {
  const doc = readFileSync(join(import.meta.dirname, "..", "docs", "pseudocode.md"), "utf8");
  expect(updatedDoc(doc)).toBe(doc);
});

it("docs/blocks.md matches the extension specs (run `pnpm run docs` to fix)", () => {
  expect(renderBlocksDoc()).toBe(readFileSync(BLOCKS_DOC, "utf8"));
});

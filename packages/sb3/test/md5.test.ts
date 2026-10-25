import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { md5 } from "../src/index.js";

describe("md5", () => {
  it("matches node:crypto across block boundaries", () => {
    for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000, 70_000]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
      expect(md5(data), `length ${n}`).toBe(createHash("md5").update(data).digest("hex"));
    }
  });
});

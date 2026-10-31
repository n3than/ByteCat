import { describe, expect, it } from "vitest";
import { costumeSizes, imageSize, shapeCostume, svgSize } from "../src/index.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("imageSize", () => {
  it("reads an SVG's viewBox, origin included, as 32-bit floats", () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="-8 -4 96 24"></svg>')).toEqual({ width: 96, height: 24, x: -8, y: -4 });
    expect(svgSize("<svg viewBox='0,0,33.3,10'/>")).toEqual({ width: Math.fround(33.3), height: 10, x: 0, y: 0 });
    // The XML declaration and comments before the root tag are skipped.
    expect(svgSize('<?xml version="1.0"?><!-- c --><svg viewBox="0 0 5 6"></svg>')).toEqual({ width: 5, height: 6, x: 0, y: 0 });
  });

  it("falls back to width and height without a viewBox", () => {
    expect(svgSize('<svg width="40px" height="30"></svg>')).toEqual({ width: 40, height: 30, x: 0, y: 0 });
    expect(svgSize("<svg></svg>")).toEqual({ width: 0, height: 0, x: 0, y: 0 });
    expect(svgSize("not an svg")).toBeNull();
  });

  it("reads bitmap headers", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0, 0, 1, 2, 0, 0, 0, 77], 16);
    expect(imageSize("a.png", png)).toEqual({ width: 258, height: 77, x: 0, y: 0 });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 1, 44, 3, 0, 0, 0]);
    expect(imageSize("a.jpg", jpg)).toEqual({ width: 300, height: 50, x: 0, y: 0 });
    const gif = bytes("GIF89a\x0a\x00\x14\x00");
    expect(imageSize("a.gif", gif)).toEqual({ width: 10, height: 20, x: 0, y: 0 });
    expect(imageSize("a.wav", png)).toBeNull();
  });

  it("measures every costume of a project by asset name", () => {
    const bar = shapeCostume("bar", "bar");
    const project = {
      json: { targets: [{ costumes: [bar.costume] }] },
      assets: new Map([[bar.costume.md5ext, bar.data]]),
    } as never;
    expect(costumeSizes(project)).toEqual({ [bar.costume.md5ext]: { width: 96, height: 24, x: 0, y: 0 } });
  });
});

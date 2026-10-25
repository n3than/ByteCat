import { md5 } from "./md5.js";
import type { Costume } from "./types.js";

export { md5 } from "./md5.js";

const encoder = new TextEncoder();

export interface Asset {
  costume: Costume;
  data: Uint8Array;
}

/** Builds an SVG costume entry whose asset id is the md5 of its bytes, as Scratch expects. */
export function svgCostume(name: string, svg: string, centerX: number, centerY: number): Asset {
  const data = encoder.encode(svg);
  const assetId = md5(data);
  return {
    costume: {
      name,
      assetId,
      md5ext: `${assetId}.svg`,
      dataFormat: "svg",
      rotationCenterX: centerX,
      rotationCenterY: centerY,
    },
    data,
  };
}

/** Plain white 480x360 backdrop. */
export function defaultBackdrop(name = "backdrop1"): Asset {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
    '<rect width="480" height="360" fill="#ffffff"/></svg>';
  return svgCostume(name, svg, 240, 180);
}

/** Built-in sprite shapes, so pseudocode projects need no external asset files. */
export const builtinShapes = {
  circle: (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
    `<circle cx="24" cy="24" r="22" fill="${color}" stroke="#333" stroke-width="2"/></svg>`,
  square: (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
    `<rect x="2" y="2" width="44" height="44" fill="${color}" stroke="#333" stroke-width="2"/></svg>`,
  triangle: (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
    `<polygon points="24,2 46,46 2,46" fill="${color}" stroke="#333" stroke-width="2"/></svg>`,
} as const;
export type BuiltinShape = keyof typeof builtinShapes;

export function isBuiltinShape(name: string): name is BuiltinShape {
  return Object.hasOwn(builtinShapes, name);
}

export function shapeCostume(name: string, shape: BuiltinShape, color = "#ffab19"): Asset {
  return svgCostume(name, builtinShapes[shape](color), 24, 24);
}

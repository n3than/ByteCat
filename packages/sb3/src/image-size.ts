// The size of a costume image as Scratch's renderer reads it, without decoding the image, so the
// runtime can fence sprites and clamp their size headless (docs/architecture.md, "Renderer").
import type { Project } from "./types.js";

/**
 * A costume image's size in its own units: an SVG's viewBox (`x`, `y` is the viewBox origin, which
 * scratch-render subtracts from the rotation center), or a bitmap's width and height in pixels
 * (`x` = `y` = 0).
 */
export interface ImageSize {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** Costume image sizes by asset file name (`md5ext`), as `costumeSizes` measures them. */
export type CostumeSizes = Readonly<Record<string, ImageSize>>;

const decoder = new TextDecoder();

/**
 * Measures a costume image from its bytes, or returns null for a format it does not know. For an SVG
 * this is what scratch-svg-renderer's `loadSvgString` gives scratch-render: the viewBox, read as
 * 32-bit floats like `viewBox.baseVal`; without a viewBox, the `width` and `height` attributes
 * (scratch-svg-renderer measures the drawing then, which needs a browser; docs/deviations.md).
 */
export function imageSize(name: string, data: Uint8Array): ImageSize | null {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "svg") return svgSize(decoder.decode(data));
  if (ext === "png") return data.length >= 24 ? bitmap(be32(data, 16), be32(data, 20)) : null;
  if (ext === "gif") return data.length >= 10 ? bitmap(data[6]! | (data[7]! << 8), data[8]! | (data[9]! << 8)) : null;
  if (ext === "bmp") return data.length >= 26 ? bitmap(le32(data, 18), Math.abs(le32(data, 22) | 0)) : null;
  if (ext === "jpg" || ext === "jpeg") return jpegSize(data);
  return null;
}

/** The size of every costume and backdrop image in the project, by asset file name. */
export function costumeSizes(project: Project): CostumeSizes {
  const sizes: Record<string, ImageSize> = {};
  for (const target of project.json.targets) {
    for (const c of target.costumes) {
      const data = project.assets.get(c.md5ext);
      const size = data && imageSize(c.md5ext, data);
      if (size) sizes[c.md5ext] = size;
    }
  }
  return sizes;
}

function bitmap(width: number, height: number): ImageSize {
  return { width, height, x: 0, y: 0 };
}

function be32(d: Uint8Array, i: number): number {
  return ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0;
}

function le32(d: Uint8Array, i: number): number {
  return (d[i]! | (d[i + 1]! << 8) | (d[i + 2]! << 16) | (d[i + 3]! << 24)) >>> 0;
}

/** The size in the first start-of-frame segment. */
function jpegSize(d: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) return null;
    const marker = d[i + 1]!;
    const length = (d[i + 2]! << 8) | d[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return bitmap((d[i + 7]! << 8) | d[i + 8]!, (d[i + 5]! << 8) | d[i + 6]!);
    }
    i += 2 + length;
  }
  return null;
}

/** The root `<svg>` tag's viewBox, or its width and height. */
export function svgSize(svg: string): ImageSize | null {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  const viewBox = attr("viewBox");
  if (viewBox) {
    const n = (viewBox[1] ?? viewBox[2]!).trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n.every(Number.isFinite)) {
      const [x, y, width, height] = n.map(Math.fround) as [number, number, number, number];
      return { width, height, x, y };
    }
  }
  const length = (name: string) => {
    const m = attr(name);
    const v = m ? parseFloat(m[1] ?? m[2]!) : NaN;
    return Number.isFinite(v) ? Math.fround(v) : 0;
  };
  return { width: length("width"), height: length("height"), x: 0, y: 0 };
}

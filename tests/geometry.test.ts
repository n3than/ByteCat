// Bytecat's headless geometry (BoxGeometry in @bytecat/runtime, cached and reordered for speed)
// against the reference's straight port of scratch-render (GeometryRenderer in @bytecat/reference),
// bit for bit, over many sprite states: costumes with a viewBox origin, a resolution 2 bitmap and
// an off-center rotation center, every rotation style, sizes, directions and positions. The browser
// oracle checks both against scratch-render itself (tests/browser-oracle.test.ts).
import { GeometryRenderer, mulberry32 } from "@bytecat/reference";
import { BoxGeometry, Runtime } from "@bytecat/runtime";
import type { CostumeSizes, ProjectJson } from "@bytecat/sb3";
import { describe, expect, it } from "vitest";

const costumes = [
  { name: "svg", md5ext: "a.svg", dataFormat: "svg", rotationCenterX: 24, rotationCenterY: 12 },
  { name: "offset", md5ext: "b.svg", dataFormat: "svg", rotationCenterX: 10, rotationCenterY: 30.5 },
  { name: "bitmap", md5ext: "c.png", dataFormat: "png", bitmapResolution: 2, rotationCenterX: 33, rotationCenterY: 7 },
  { name: "odd", md5ext: "d.svg", dataFormat: "svg", rotationCenterX: 0, rotationCenterY: 0 },
];
const sizes: CostumeSizes = {
  "a.svg": { width: 96, height: 24, x: 0, y: 0 },
  "b.svg": { width: Math.fround(47.3), height: 61, x: -8, y: Math.fround(4.25) },
  "c.png": { width: 81, height: 40, x: 0, y: 0 },
  "d.svg": { width: 7, height: 13, x: 0, y: 0 },
};
const project = {
  targets: [
    { isStage: true, name: "Stage", variables: {}, lists: {}, costumes: [], currentCostume: 0, layerOrder: 0 },
    { isStage: false, name: "S", variables: {}, lists: {}, costumes, currentCostume: 0, layerOrder: 1, x: 0, y: 0, direction: 90, size: 100, visible: true, rotationStyle: "all around" },
  ],
} as unknown as ProjectJson;

describe("BoxGeometry", () => {
  it("matches the port of scratch-render's fence, AABB and skin size", () => {
    const rt = new Runtime(project, () => [], { clock: "virtual", costumeSizes: sizes });
    const t = rt.targets[1]!;
    const box = new BoxGeometry();
    // The reference's VM side: one target with a drawable, showing the same costume.
    const twTarget = { isStage: false, drawableID: 0, currentCostume: 0, getCostumes: () => costumes.map((c) => ({ ...c, md5: c.md5ext })) };
    const twCostumes = twTarget.getCostumes();
    twTarget.getCostumes = () => twCostumes;
    const renderer = new GeometryRenderer({ targets: [twTarget], executableTargets: [twTarget] } as never, sizes);
    twTarget.drawableID = renderer.createDrawable();
    const random = mulberry32(7);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
    const styles = ["all around", "left-right", "don't rotate"];
    for (let i = 0; i < 20000; i++) {
      t.costume = twTarget.currentCostume = Math.floor(random() * costumes.length);
      t.size = pick([100, 5, 37.5, 250, 1125, random() * 400]);
      t.direction = pick([90, -90, 0, 180, 45, -135, random() * 360 - 179]);
      t.rotationStyle = pick(styles);
      t.x = pick([0, 240, -240, 249.5, (random() - 0.5) * 700]);
      t.y = pick([0, 180, -180, -0.5, (random() - 0.5) * 500]);
      // RenderedTarget._getRenderedDirectionAndScale, as the VM gives it to the renderer.
      let direction = t.direction;
      let scale: [number, number] = [t.size, t.size];
      if (t.rotationStyle === "don't rotate") direction = 90;
      else if (t.rotationStyle === "left-right") {
        direction = 90;
        scale = [(t.direction < 0 ? -1 : 1) * t.size, t.size];
      }
      renderer.updateDrawableDirectionScale(twTarget.drawableID, direction, scale);
      renderer.updateDrawablePosition(twTarget.drawableID, [t.x, t.y]);
      const state = `${t.costumes[t.costume]!.name} size ${t.size} direction ${t.direction} ${t.rotationStyle} at ${t.x}, ${t.y}`;
      expect(box.bounds(t), state).toEqual(renderer.getBounds(twTarget.drawableID));
      expect(box.costumeSize(t), state).toEqual(renderer.getCurrentSkinSize(twTarget.drawableID));
      for (let k = 0; k < 4; k++) {
        const x = pick([t.x, 1000, -1000, (random() - 0.5) * 600]);
        const y = pick([t.y, 1000, -1000, (random() - 0.5) * 450]);
        expect(box.fence(t, x, y), `${state}, fenced at ${x}, ${y}`).toEqual(renderer.getFencedPositionOfDrawable(twTarget.drawableID, [x, y]));
      }
    }
  });

  it("knows nothing about a costume that was not measured", () => {
    const rt = new Runtime(project, () => [], { clock: "virtual", costumeSizes: {} });
    const t = rt.targets[1]!;
    expect(rt.geometry!.bounds(t)).toBeNull();
    expect(rt.geometry!.costumeSize(t)).toBeNull();
    expect(rt.geometry!.fence(t, 1000, -1000)).toEqual([1000, -1000]);
    expect(new Runtime(project, () => [], {}).geometry).toBeNull();
  });
});

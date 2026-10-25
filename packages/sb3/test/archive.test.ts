import { describe, expect, it } from "vitest";
import { defaultBackdrop, readSb3, writeSb3, type Project } from "../src/index.js";

function tinyProject(): Project {
  const backdrop = defaultBackdrop();
  return {
    json: {
      targets: [{
        isStage: true, name: "Stage", variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: 0, costumes: [backdrop.costume], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null,
      }],
      monitors: [], extensions: [], meta: { semver: "3.0.0", vm: "0.2.0", agent: "test" },
    },
    assets: new Map([[backdrop.costume.md5ext, backdrop.data]]),
  };
}

describe("sb3 archive", () => {
  it("round-trips project.json and assets", () => {
    const project = tinyProject();
    const back = readSb3(writeSb3(project));
    expect(back.json).toEqual(project.json);
    expect([...back.assets.keys()]).toEqual([...project.assets.keys()]);
  });

  it("is byte-for-byte deterministic", () => {
    expect(writeSb3(tinyProject())).toEqual(writeSb3(tinyProject()));
  });

  it("names assets by the md5 of their content", () => {
    const { costume } = defaultBackdrop();
    expect(costume.md5ext).toMatch(/^[0-9a-f]{32}\.svg$/);
  });
});

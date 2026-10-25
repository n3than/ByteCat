import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Project, ProjectJson } from "./types.js";

/** Packs a project into .sb3 bytes (a zip with project.json and assets at the root). */
export function writeSb3(project: Project): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(project.json)),
  };
  for (const [name, data] of project.assets) files[name] = data;
  // Fixed mtime keeps output byte-identical across runs.
  return zipSync(files, { level: 6, mtime: new Date("2020-01-01T00:00:00Z") });
}

/** Unpacks .sb3 bytes. Does not validate the project structure. */
export function readSb3(bytes: Uint8Array): Project {
  const files = unzipSync(bytes);
  const jsonBytes = files["project.json"];
  if (!jsonBytes) throw new Error("sb3 archive has no project.json");
  const assets = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) {
    if (name !== "project.json") assets.set(name, data);
  }
  return { json: JSON.parse(strFromU8(jsonBytes)) as ProjectJson, assets };
}

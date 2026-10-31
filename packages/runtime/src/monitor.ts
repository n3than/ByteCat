// List monitors: the boxes `show list` puts on the stage. The runtime keeps their state (which are
// visible, where, how big); the player draws them from the lists' live contents.
import type { ProjectJson } from "@bytecat/sb3";
import type { Runtime } from "./runtime.js";
import type { Target } from "./target.js";

/** The size of a list monitor the project gives no size for, as in the Scratch editor. */
export const DEFAULT_LIST_WIDTH = 100;
export const DEFAULT_LIST_HEIGHT = 200;
const STAGE_W = 480;
const STAGE_H = 360;
const PADDING = 5;

export interface ListMonitor {
  /** The list's id. */
  id: string;
  /** The list's name. */
  name: string;
  /** The sprite whose own list it is, or null for a stage (global) list. */
  sprite: string | null;
  /** Top-left corner and size in stage pixels, origin top-left, y down. */
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  /** False until it has a position: the project gave none (width and height 0). */
  placed: boolean;
}

interface MonitorJson {
  id?: string;
  mode?: string;
  opcode?: string;
  params?: Record<string, string>;
  spriteName?: string | null;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  visible?: boolean;
}

/** The list monitors in project.json, in order. Variable monitors are not drawn and are left out. */
export function listMonitorsOf(project: ProjectJson): Map<string, ListMonitor> {
  const out = new Map<string, ListMonitor>();
  for (const m of (project.monitors ?? []) as MonitorJson[]) {
    if (m.mode !== "list" || typeof m.id !== "string") continue;
    const width = Number(m.width) || 0;
    const height = Number(m.height) || 0;
    const placed = width > 0 || height > 0;
    out.set(m.id, {
      id: m.id,
      name: m.params?.LIST ?? "",
      sprite: m.spriteName ?? null,
      x: Number(m.x) || 0,
      y: Number(m.y) || 0,
      width: width || DEFAULT_LIST_WIDTH,
      height: height || DEFAULT_LIST_HEIGHT,
      visible: !!m.visible,
      placed,
    });
  }
  return out;
}

/** Gives every visible monitor without a position the first free spot, scanning from the top left. */
export function placeMonitors(monitors: Iterable<ListMonitor>): void {
  const all = [...monitors];
  for (const m of all) {
    if (!m.visible || m.placed) continue;
    const others = all.filter((o) => o !== m && o.visible && o.placed);
    const free = (x: number, y: number) =>
      others.every((o) => x + m.width + PADDING <= o.x || o.x + o.width + PADDING <= x || y + m.height + PADDING <= o.y || o.y + o.height + PADDING <= y);
    let spot: [number, number] | null = null;
    for (let y = PADDING; !spot && y + m.height <= STAGE_H; y += PADDING) {
      for (let x = PADDING; x + m.width <= STAGE_W; x += PADDING) {
        if (free(x, y)) {
          spot = [x, y];
          break;
        }
      }
    }
    [m.x, m.y] = spot ?? [PADDING, PADDING];
    m.placed = true;
  }
}

/** The name of the list with this id anywhere in the project. */
function listName(project: ProjectJson, id: string): string {
  for (const t of project.targets) if (id in t.lists) return t.lists[id]![0];
  return "";
}

/**
 * `show list` and `hide list`. The list is the running target's own or the stage's, by id; a list
 * the project does not have is ignored. A monitor the project does not describe is created.
 */
export function showList(rt: Runtime, t: Target, id: string, visible: boolean): void {
  let m = rt.listMonitors.get(id);
  if (!m) {
    const own = id in t.l;
    if (!own && !(id in rt.stage.l)) return;
    m = {
      id,
      name: listName(rt.project, id),
      sprite: own && !t.isStage ? t.name : null,
      x: 0,
      y: 0,
      width: DEFAULT_LIST_WIDTH,
      height: DEFAULT_LIST_HEIGHT,
      visible: false,
      placed: false,
    };
    rt.listMonitors.set(id, m);
  }
  if (m.visible === visible) return;
  m.visible = visible;
  placeMonitors(rt.listMonitors.values());
  rt.requestRedraw();
}

/** The live items of a monitor's list, or null if its sprite or list does not exist. */
export function monitorItems(rt: Runtime, m: ListMonitor): readonly unknown[] | null {
  const owner = m.sprite === null ? rt.stage : rt.targets.find((t) => t.isOriginal && !t.isStage && t.name === m.sprite);
  return owner?.l[m.id] ?? null;
}

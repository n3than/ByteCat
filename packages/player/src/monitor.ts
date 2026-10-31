// Draws the list monitors (`show list`) the way the Scratch GUI does: a box with the list's name
// on top, one row per item (its number, then the item on an orange label) and "length N" below.
// Close to TurboWarp's look, not pixel for pixel. A long list is clipped at the box, not scrolled.
import { monitorItems, type ListMonitor, type Runtime } from "@bytecat/runtime";

export const MONITOR_COLORS = {
  /** The box body behind the rows. */
  body: "#e6f0ff",
  /** Header and footer strips. */
  bar: "#ffffff",
  border: "#c8cfd8",
  /** The label behind each item (the list category's color). */
  item: "#fc662c",
  itemText: "#ffffff",
  text: "#575e75",
} as const;

const BAR = 22;
const ROW = 22;
const NUMBER_WIDTH = 24;
const FONT = "12px Helvetica, Arial, sans-serif";

/** Draws every visible list monitor of the runtime, in the order they were shown. Needs the canvas's stage-pixel transform. */
export function drawListMonitors(ctx: CanvasRenderingContext2D, rt: Runtime): void {
  for (const m of rt.listMonitors.values()) {
    if (!m.visible) continue;
    drawListMonitor(ctx, m, monitorItems(rt, m) ?? [], m.sprite === null ? m.name : `${m.sprite}: ${m.name}`);
  }
}

function drawListMonitor(ctx: CanvasRenderingContext2D, m: ListMonitor, items: readonly unknown[], label: string): void {
  const { x, y, width: w, height: h } = m;
  const c = MONITOR_COLORS;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  // The box, with the header and footer strips.
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fillStyle = c.body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = c.bar;
  ctx.fillRect(x, y, w, BAR);
  ctx.fillRect(x, y + h - BAR, w, BAR);
  ctx.fillStyle = c.border;
  ctx.fillRect(x, y + BAR - 1, w, 1);
  ctx.fillRect(x, y + h - BAR, w, 1);
  // Rows, clipped to the space between the strips.
  ctx.beginPath();
  ctx.rect(x, y + BAR, w, h - 2 * BAR);
  ctx.clip();
  const rows = Math.min(items.length, Math.ceil((h - 2 * BAR) / ROW));
  for (let i = 0; i < rows; i++) {
    const top = y + BAR + 3 + i * ROW;
    ctx.fillStyle = c.text;
    ctx.textAlign = "right";
    ctx.fillText(String(i + 1), x + NUMBER_WIDTH, top + ROW / 2 - 2);
    ctx.fillStyle = c.item;
    ctx.beginPath();
    ctx.roundRect(x + NUMBER_WIDTH + 4, top, w - NUMBER_WIDTH - 12, ROW - 4, 3);
    ctx.fill();
    ctx.fillStyle = c.itemText;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, String(items[i]), w - NUMBER_WIDTH - 24), x + NUMBER_WIDTH + 10, top + ROW / 2 - 2);
  }
  ctx.restore();
  // Header and footer text.
  ctx.fillStyle = c.text;
  ctx.textAlign = "center";
  ctx.font = `bold ${FONT}`;
  ctx.fillText(fit(ctx, label, w - 8), x + w / 2, y + BAR / 2);
  ctx.font = FONT;
  ctx.fillText(fit(ctx, `length ${items.length}`, w - 8), x + w / 2, y + h - BAR / 2);
  // The outline.
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 4);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** The text cut to `width` pixels with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 0 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

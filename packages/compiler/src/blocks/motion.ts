import type { ReporterHandler, StatementHandler } from "../types.js";
import { numEx } from "../cast.js";

export const motionStatements: Record<string, StatementHandler> = {
  motion_movesteps: (b, g) => [`rt.move(t, ${g.num(b, "STEPS")});`],
  motion_turnright: (b, g) => [`rt.setDirection(t, t.direction + ${g.num(b, "DEGREES")});`],
  motion_turnleft: (b, g) => [`rt.setDirection(t, t.direction - ${g.num(b, "DEGREES")});`],
  motion_gotoxy: (b, g) => [`rt.setXY(t, ${g.num(b, "X")}, ${g.num(b, "Y")});`],
  motion_glidesecstoxy: (b, g) => g.y(`yield* rt.glide(t, ${g.num(b, "SECS")}, ${g.num(b, "X")}, ${g.num(b, "Y")});`),
  motion_pointindirection: (b, g) => [`rt.setDirection(t, ${g.num(b, "DIRECTION")});`],
  motion_changexby: (b, g) => [`rt.setXY(t, t.x + ${g.num(b, "DX")}, t.y);`],
  motion_setx: (b, g) => [`rt.setXY(t, ${g.num(b, "X")}, t.y);`],
  motion_changeyby: (b, g) => [`rt.setXY(t, t.x, t.y + ${g.num(b, "DY")});`],
  motion_sety: (b, g) => [`rt.setXY(t, t.x, ${g.num(b, "Y")});`],
  motion_ifonedgebounce: () => ["rt.bounce(t);"],
  motion_setrotationstyle: (b, g) => [`t.rotationStyle = ${JSON.stringify(g.field(b, "STYLE"))};`],
};

export const motionReporters: Record<string, ReporterHandler> = {
  motion_xposition: () => numEx("rt.coord(t.x)"),
  motion_yposition: () => numEx("rt.coord(t.y)"),
  motion_direction: () => numEx("t.direction"),
};

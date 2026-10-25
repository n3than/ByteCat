import type { StatementHandler } from "../types.js";

export const eventStatements: Record<string, StatementHandler> = {
  event_broadcast: (b, g) => [`rt.broadcast(${g.any(b, "BROADCAST_INPUT")});`],
  event_broadcastandwait: (b, g) => g.y(`yield* rt.broadcastAndWait(${g.any(b, "BROADCAST_INPUT")});`),
};

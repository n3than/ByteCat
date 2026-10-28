import type { ScriptNode } from "../ast.js";
import type { TargetBuilder } from "../lower.js";

/** Lowers the hat of a `when` script (flag, click, key or broadcast) and returns its block id. */
export function whenHat(b: TargetBuilder, script: Extract<ScriptNode, { kind: "when" }>): string {
  const h = script.hat;
  let hat: string;
  if (h.kind === "flag") hat = b.block("event_whenflagclicked", null, script.pos);
  else if (h.kind === "clicked") hat = b.block(b.isStage ? "event_whenstageclicked" : "event_whenthisspriteclicked", null, script.pos);
  else if (h.kind === "key") {
    hat = b.block("event_whenkeypressed", null, script.pos);
    b.get(hat).fields.KEY_OPTION = [h.key, null];
  } else {
    const msg = b.scope.broadcast(h.message);
    hat = b.block("event_whenbroadcastreceived", null, script.pos);
    b.get(hat).fields.BROADCAST_OPTION = [msg.name, msg.id];
  }
  return hat;
}

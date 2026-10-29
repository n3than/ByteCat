import { hat, menu, missingHat, statement, type Extension } from "./api.js";

export const event: Extension = {
  id: "event",
  name: "Events",
  runtime: "@bytecat/runtime/event",
  blocks: {
    event_whenflagclicked: hat("flag", { restartExistingThreads: true }),
    event_whenkeypressed: hat("key", { matchField: "KEY_OPTION", restartExistingThreads: false }),
    event_whenthisspriteclicked: hat("click", { restartExistingThreads: true }),
    event_whenstageclicked: hat("click", { restartExistingThreads: true }),
    event_whenbackdropswitchesto: missingHat({ restartExistingThreads: true }, "switching backdrops starts no hats yet"),
    event_whengreaterthan: missingHat(
      { restartExistingThreads: false, edgeActivated: true },
      "edge-triggered: when timer or loudness rises above a value",
    ),
    event_whentouchingobject: missingHat(
      { restartExistingThreads: false, edgeActivated: true },
      "edge-triggered; needs costume geometry",
      { hidden: true },
    ),
    event_whenbroadcastreceived: hat("broadcast", { matchField: "BROADCAST_OPTION", restartExistingThreads: true }),
    event_broadcast: statement((b, g) => [`broadcast(rt, ${g.any(b, "BROADCAST_INPUT")});`], { uses: ["broadcast"] }),
    event_broadcastandwait: statement((b, g) => g.y(`yield* broadcastAndWait(rt, ${g.any(b, "BROADCAST_INPUT")});`), {
      yields: "wait",
      uses: ["broadcastAndWait"],
    }),
    event_broadcast_menu: menu("BROADCAST_OPTION"),
    event_touchingobjectmenu: menu("TOUCHINGOBJECTMENU", { hidden: true }),
  },
};

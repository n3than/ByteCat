(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"];
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      v0 = v0 + 1;
      S.l["list_5"].push(("ping " + ("" + v0)));
      S.v["var_0"] = v0;
      yield* rt.broadcastAndWait("ping");
      v0 = S.v["var_0"];
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    rt.broadcast("done");
    S.v["var_0"] = v0;
} },
{ target: 2, kind: "broadcast", arg: "ping", fn: function* (t, th) {
    S.l["list_5"].push(("pong " + ("" + S.v["var_0"])));
} },
{ target: 2, kind: "broadcast", arg: "done", fn: function* (t, th) {
    S.l["list_5"].push("game over");
    throw rt.STOP_ALL;
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    for (let r0 = Math.round(400000); r0 > 0; r0--) {
      yield* rt.broadcastAndWait("ping");
      if (th.warp === 0) yield;
    }
    S.l["list_6"].push(S.v["var_0"]);
} },
{ target: 2, kind: "broadcast", arg: "ping", fn: function* (t, th) {
    S.v["var_0"] = S.v["var_0"] + 1;
} },
];
})

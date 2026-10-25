(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function* p1_0(t, th, a0) {
  if (gt(a0, 0)) {
    S.v["var_0"] = toNum(S.v["var_0"]) + 1;
    if (th.warp === 0) yield;
    yield* p1_0(t, th, (toNum(a0) - 1));
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    rt.broadcast("go");
    yield* p1_0(t, th, "3");
    S.l["list_h"].push(("done " + toStr(S.v["var_0"])));
} },
{ target: 2, kind: "broadcast", arg: "go", fn: function* (t, th) {
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      S.l["list_h"].push("tick");
      if (th.warp === 0) yield;
    }
} },
];
})

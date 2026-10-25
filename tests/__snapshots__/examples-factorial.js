(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function* p1_0(t, th, a0) {
  if (!(a0 > 1)) {
    S.v["var_0"] = 1;
  } else {
    S.l["list_1"].push(a0);
    if (th.warp === 0) yield;
    yield* p1_0(t, th, (a0 - 1));
    S.v["var_0"] = (toNum(S.v["var_0"]) * toNum(itemOf(S.l["list_1"], S.l["list_1"].length)));
    deleteOf(S.l["list_1"], S.l["list_1"].length);
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    yield* p1_0(t, th, 5);
    S.l["list_p"].push(S.v["var_0"]);
    yield* p1_0(t, th, 10);
    S.l["list_p"].push(S.v["var_0"]);
    S.l["list_p"].push(S.l["list_1"].length);
} },
];
})

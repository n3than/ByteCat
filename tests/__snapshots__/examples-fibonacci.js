(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.v["var_0"] = 0;
  S.v["var_1"] = 1;
  for (let r0 = Math.round(toNum(a0)); r0 > 0; r0--) {
    S.v["var_2"] = (toNum(S.v["var_0"]) + toNum(S.v["var_1"]));
    S.v["var_0"] = S.v["var_1"];
    S.v["var_1"] = S.v["var_2"];
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.v["var_3"] = 0;
    while (!gt(S.v["var_3"], 10)) {
      p1_0(t, th, S.v["var_3"]);
      S.l["list_m"].push(S.v["var_0"]);
      S.v["var_3"] = toNum(S.v["var_3"]) + 1;
      if (th.warp === 0) yield;
    }
} },
];
})

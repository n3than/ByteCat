(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.v["var_0"] = 0;
  S.v["var_1"] = 1;
  while (!gt(S.v["var_1"], a0)) {
    S.v["var_0"] = mod(((toNum(S.v["var_0"]) * 31) + (toNum(S.v["var_1"]) * 7)), 1000003);
    S.v["var_1"] = toNum(S.v["var_1"]) + 1;
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, 700000);
    S.l["list_k"].push(S.v["var_0"]);
} },
];
})

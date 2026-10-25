(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  if (lt(a0, 2)) {
    S.v["var_0"] = a0;
  } else {
    p1_0(t, th, (toNum(a0) - 1));
    S.l["list_1"].push(S.v["var_0"]);
    p1_0(t, th, (toNum(a0) - 2));
    S.v["var_0"] = toNum(S.v["var_0"]) + toNum(itemOf(S.l["list_1"], S.l["list_1"].length));
    deleteOf(S.l["list_1"], S.l["list_1"].length);
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, 27);
    S.l["list_q"].push(S.v["var_0"]);
    S.l["list_q"].push(S.l["list_1"].length);
} },
];
})

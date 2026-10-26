(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  if ((a0 < 0)) {
    S.l["list_a"].push("negative");
  } else {
    if ((a0 === 0)) {
      S.l["list_a"].push("zero");
    } else {
      S.l["list_a"].push("positive");
    }
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, (-5));
    p1_0(t, th, 0);
    p1_0(t, th, 7);
    while (!!(S.v["var_1"] < 10)) {
      S.v["var_1"] = S.v["var_1"] + 3;
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_a"].push(S.v["var_1"]);
    S.v["var_0"] = 0;
    for (;;) {
      S.v["var_0"] = S.v["var_0"] + 1;
      if ((S.v["var_0"] === 4)) {
        S.l["list_a"].push(S.v["var_0"]);
        return;
      }
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
} },
];
})

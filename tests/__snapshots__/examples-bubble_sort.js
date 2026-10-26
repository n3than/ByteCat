(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    while (!!eq(S.v["var_3"], 1)) {
      S.v["var_3"] = 0;
      S.v["var_1"] = 1;
      while (!gt(S.v["var_1"], (S.l["list_4"].length - 1))) {
        if (gt(itemOf(S.l["list_4"], S.v["var_1"]), itemOf(S.l["list_4"], (toNum(S.v["var_1"]) + 1)))) {
          S.v["var_2"] = itemOf(S.l["list_4"], S.v["var_1"]);
          replaceAt(S.l["list_4"], S.v["var_1"], itemOf(S.l["list_4"], (toNum(S.v["var_1"]) + 1)));
          replaceAt(S.l["list_4"], (toNum(S.v["var_1"]) + 1), S.v["var_2"]);
          S.v["var_3"] = 1;
        }
        S.v["var_1"] = toNum(S.v["var_1"]) + 1;
        if (th.warp === 0) yield;
      }
      if (th.warp === 0) yield;
    }
    S.v["var_0"] = 1;
    while (!gt(S.v["var_0"], S.l["list_4"].length)) {
      S.l["list_y"].push(itemOf(S.l["list_4"], S.v["var_0"]));
      S.v["var_0"] = toNum(S.v["var_0"]) + 1;
      if (th.warp === 0) yield;
    }
} },
];
})

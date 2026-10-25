(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_3"].length = 0;
    while (!!(S.l["list_3"].length < 10)) {
      S.v["var_2"] = "1";
      S.v["var_1"] = "2";
      while (!!(!gt((toNum(S.v["var_1"]) * toNum(S.v["var_1"])), S.v["var_0"]) && eq(S.v["var_2"], 1))) {
        if ((mod(toNum(S.v["var_0"]), toNum(S.v["var_1"])) === 0)) {
          S.v["var_2"] = "0";
        }
        S.v["var_1"] = toNum(S.v["var_1"]) + 1;
        if (th.warp === 0) yield;
      }
      if (eq(S.v["var_2"], 1)) {
        S.l["list_3"].push(S.v["var_0"]);
      }
      S.v["var_0"] = toNum(S.v["var_0"]) + 1;
      if (th.warp === 0) yield;
    }
    S.l["list_t"].push(listContents(S.l["list_3"]));
    S.l["list_t"].push(listContains(S.l["list_3"], "29"));
    S.l["list_t"].push(indexOf(S.l["list_3"], "13"));
} },
];
})

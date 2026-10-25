(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_5"].push(toStr(S.v["var_0"]).length);
    S.l["list_5"].push(letterOf("1", S.v["var_0"]));
    S.l["list_5"].push(contains(S.v["var_0"], "cat"));
    S.v["var_2"] = "1";
    while (!gt(S.v["var_2"], toStr(S.v["var_0"]).length)) {
      S.v["var_1"] = (letterOf(S.v["var_2"], S.v["var_0"]) + toStr(S.v["var_1"]));
      S.v["var_2"] = toNum(S.v["var_2"]) + 1;
      if (th.warp === 0) yield;
    }
    S.l["list_5"].push(S.v["var_1"]);
    S.l["list_5"].push(("a" + ("b" + ("c" + ("" + (1 + 2))))));
} },
];
})

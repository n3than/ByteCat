(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.v["var_0"] = "";
  S.v["var_1"] = "1";
  while (!gt(S.v["var_1"], a0)) {
    S.v["var_0"] = (toStr(S.v["var_0"]) + letterOf((mod(toNum(S.v["var_1"]), 26) + 1), "abcdefghijklmnopqrstuvwxyz"));
    S.v["var_1"] = toNum(S.v["var_1"]) + 1;
  }
}
function p1_1(t, th) {
  S.v["var_2"] = "0";
  S.v["var_1"] = "1";
  while (!gt(S.v["var_1"], toStr(S.v["var_0"]).length)) {
    S.v["var_3"] = letterOf(S.v["var_1"], S.v["var_0"]);
    if ((((((toStr(S.v["var_3"]).toLowerCase() === "a") || (toStr(S.v["var_3"]).toLowerCase() === "e")) || (toStr(S.v["var_3"]).toLowerCase() === "i")) || (toStr(S.v["var_3"]).toLowerCase() === "o")) || (toStr(S.v["var_3"]).toLowerCase() === "u"))) {
      S.v["var_2"] = toNum(S.v["var_2"]) + 1;
    }
    S.v["var_1"] = toNum(S.v["var_1"]) + 1;
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, "100000");
    S.l["list_17"].push(toStr(S.v["var_0"]).length);
    p1_1(t, th);
    S.l["list_17"].push(S.v["var_2"]);
} },
];
})

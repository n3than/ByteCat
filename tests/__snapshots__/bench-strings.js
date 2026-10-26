(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.v["var_0"] = "";
  S.v["var_1"] = 1;
  while (!(S.v["var_1"] > a0)) {
    S.v["var_0"] = (S.v["var_0"] + "abcdefghijklmnopqrstuvwxyz".charAt((((S.v["var_1"] % 26) + 1) | 0) - 1));
    S.v["var_1"] = S.v["var_1"] + 1;
  }
}
function p1_1(t, th) {
  S.v["var_2"] = 0;
  S.v["var_1"] = 1;
  while (!(S.v["var_1"] > S.v["var_0"].length)) {
    S.v["var_3"] = S.v["var_0"].charAt((S.v["var_1"] | 0) - 1);
    if ((((((S.v["var_3"].toLowerCase() === "a") || (S.v["var_3"].toLowerCase() === "e")) || (S.v["var_3"].toLowerCase() === "i")) || (S.v["var_3"].toLowerCase() === "o")) || (S.v["var_3"].toLowerCase() === "u"))) {
      S.v["var_2"] = S.v["var_2"] + 1;
    }
    S.v["var_1"] = S.v["var_1"] + 1;
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, 100000);
    S.l["list_17"].push(S.v["var_0"].length);
    p1_1(t, th);
    S.l["list_17"].push(S.v["var_2"]);
} },
];
})

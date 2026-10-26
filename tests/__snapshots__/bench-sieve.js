(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.l["list_3"].length = 0;
  S.v["var_0"] = 1;
  while (!(S.v["var_0"] > a0)) {
    S.l["list_3"].push(1);
    S.v["var_0"] = S.v["var_0"] + 1;
  }
  if (1 <= S.l["list_3"].length) S.l["list_3"][0] = 0;
  S.v["var_0"] = 2;
  while (!(S.v["var_0"] > a0)) {
    if ((itemOf(S.l["list_3"], S.v["var_0"]) === 1)) {
      S.v["var_1"] = (S.v["var_0"] * S.v["var_0"]);
      while (!(S.v["var_1"] > a0)) {
        replaceAt(S.l["list_3"], S.v["var_1"], 0);
        S.v["var_1"] = S.v["var_1"] + S.v["var_0"];
      }
    }
    S.v["var_0"] = S.v["var_0"] + 1;
  }
  S.v["var_2"] = 0;
  S.v["var_0"] = 1;
  while (!(S.v["var_0"] > a0)) {
    S.v["var_2"] = S.v["var_2"] + toNum(itemOf(S.l["list_3"], S.v["var_0"]));
    S.v["var_0"] = S.v["var_0"] + 1;
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th, 150000);
    S.l["list_18"].push(S.v["var_2"]);
    S.l["list_18"].push(S.l["list_3"].length);
} },
];
})

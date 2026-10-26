(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  let v0 = S.v["var_0"], v1 = S.v["var_1"];
  v0 = "";
  v1 = 1;
  while (!(v1 > a0)) {
    v0 = (v0 + "abcdefghijklmnopqrstuvwxyz".charAt(((v1 % 26) + 1) - 1));
    v1 = v1 + 1;
  }
  S.v["var_0"] = v0; S.v["var_1"] = v1;
}
function p1_1(t, th) {
  let v0 = S.v["var_2"], v1 = S.v["var_1"], v2 = S.v["var_0"], v3 = S.v["var_3"];
  v0 = 0;
  v1 = 1;
  while (!(v1 > v2.length)) {
    v3 = v2.charAt(v1 - 1);
    if ((((((v3.toLowerCase() === "a") || (v3.toLowerCase() === "e")) || (v3.toLowerCase() === "i")) || (v3.toLowerCase() === "o")) || (v3.toLowerCase() === "u"))) {
      v0 = v0 + 1;
    }
    v1 = v1 + 1;
  }
  S.v["var_2"] = v0; S.v["var_1"] = v1; S.v["var_3"] = v3;
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

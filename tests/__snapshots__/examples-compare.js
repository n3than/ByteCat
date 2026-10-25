(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_6"].push((toStr(S.v["var_0"]).toLowerCase() === "apple"));
    S.l["list_6"].push((toStr(S.v["var_0"]).toLowerCase() === "apple"));
    S.l["list_6"].push((toStr(S.v["var_0"]).toLowerCase() < "banana"));
    S.l["list_6"].push((toStr(S.v["var_0"]).toLowerCase() > "ant"));
    S.l["list_6"].push(eq(S.v["var_1"], "10.0"));
    S.l["list_6"].push(gt(S.v["var_1"], 9));
    S.l["list_6"].push(lt(S.v["var_1"], 9));
    S.l["list_6"].push(gt(S.v["var_1"], "9 "));
    S.l["list_6"].push((toStr(S.v["var_2"]).toLowerCase() === ""));
    S.l["list_6"].push(eq(S.v["var_2"], 0));
    S.l["list_6"].push((toStr(S.v["var_3"]).toLowerCase() === " "));
    S.l["list_6"].push(eq(S.v["var_3"], 0));
    S.l["list_6"].push(eq(S.v["var_1"], "1e1"));
    S.l["list_6"].push(eq(S.v["var_0"], 0));
    S.l["list_6"].push(gt(S.v["var_0"], 5));
    S.l["list_6"].push(("true" === "true"));
    S.l["list_6"].push((toStr(S.v["var_0"]).length === 5));
} },
];
})

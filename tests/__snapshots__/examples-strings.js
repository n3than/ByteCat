(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"], v1 = S.v["var_2"], v2 = S.v["var_1"];
    S.l["list_5"].push(v0.length);
    S.l["list_5"].push(v0.charAt(0));
    S.l["list_5"].push(contains(v0, "cat"));
    v1 = 1;
    while (!(v1 > v0.length)) {
      v2 = (v0.charAt(v1 - 1) + v2);
      v1 = v1 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_2"] = v1; S.v["var_1"] = v2;
        yield;
        v0 = S.v["var_0"]; v1 = S.v["var_2"]; v2 = S.v["var_1"];
      }
    }
    S.l["list_5"].push(v2);
    S.l["list_5"].push(("a" + ("b" + ("c" + ("" + (1 + 2))))));
    S.v["var_2"] = v1; S.v["var_1"] = v2;
} },
];
})

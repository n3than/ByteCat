(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_2"], v1 = S.v["var_1"], v2 = S.v["var_0"];
    S.l["list_3"].length = 0;
    while ((S.l["list_3"].length < 10)) {
      v0 = 1;
      v1 = 2;
      while ((!((v1 * v1) > v2) && (v0 === 1))) {
        if (((v2 % v1) === 0)) {
          v0 = 0;
        }
        v1 = v1 + 1;
        if (th.warp === 0 && --rt.spin < 0) {
          S.v["var_2"] = v0; S.v["var_1"] = v1; S.v["var_0"] = v2;
          yield;
          v0 = S.v["var_2"]; v1 = S.v["var_1"]; v2 = S.v["var_0"];
        }
      }
      if ((v0 === 1)) {
        S.l["list_3"].push(v2);
      }
      v2 = v2 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_2"] = v0; S.v["var_1"] = v1; S.v["var_0"] = v2;
        yield;
        v0 = S.v["var_2"]; v1 = S.v["var_1"]; v2 = S.v["var_0"];
      }
    }
    S.l["list_t"].push(listContents(S.l["list_3"]));
    S.l["list_t"].push(listContains(S.l["list_3"], 29));
    S.l["list_t"].push(indexOf(S.l["list_3"], 13));
    S.v["var_2"] = v0; S.v["var_1"] = v1; S.v["var_0"] = v2;
} },
];
})

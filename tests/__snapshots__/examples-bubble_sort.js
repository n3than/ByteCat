(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_3"], v1 = S.v["var_1"], v2 = S.v["var_2"], v3 = S.v["var_0"];
    while ((v0 === 1)) {
      v0 = 0;
      v1 = 1;
      while (!(v1 > (S.l["list_4"].length - 1))) {
        if (gt((S.l["list_4"][v1 - 1] ?? ""), (S.l["list_4"][(v1 + 1) - 1] ?? ""))) {
          v2 = (S.l["list_4"][v1 - 1] ?? "");
          if (v1 > 0 && v1 <= S.l["list_4"].length) S.l["list_4"][v1 - 1] = (S.l["list_4"][(v1 + 1) - 1] ?? "");
          { const r0 = (v1 + 1); if (r0 <= S.l["list_4"].length) S.l["list_4"][r0 - 1] = v2; }
          v0 = 1;
        }
        v1 = v1 + 1;
        if (th.warp === 0 && --rt.spin < 0) {
          S.v["var_3"] = v0; S.v["var_1"] = v1; S.v["var_2"] = v2; S.v["var_0"] = v3;
          yield;
          v0 = S.v["var_3"]; v1 = S.v["var_1"]; v2 = S.v["var_2"]; v3 = S.v["var_0"];
        }
      }
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_3"] = v0; S.v["var_1"] = v1; S.v["var_2"] = v2; S.v["var_0"] = v3;
        yield;
        v0 = S.v["var_3"]; v1 = S.v["var_1"]; v2 = S.v["var_2"]; v3 = S.v["var_0"];
      }
    }
    v3 = 1;
    while (!(v3 > S.l["list_4"].length)) {
      S.l["list_y"].push((S.l["list_4"][v3 - 1] ?? ""));
      v3 = v3 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_3"] = v0; S.v["var_1"] = v1; S.v["var_2"] = v2; S.v["var_0"] = v3;
        yield;
        v0 = S.v["var_3"]; v1 = S.v["var_1"]; v2 = S.v["var_2"]; v3 = S.v["var_0"];
      }
    }
    S.v["var_3"] = v0; S.v["var_1"] = v1; S.v["var_2"] = v2; S.v["var_0"] = v3;
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    while ((S.v["var_3"] === 1)) {
      S.v["var_3"] = 0;
      S.v["var_1"] = 1;
      while (!(S.v["var_1"] > (S.l["list_4"].length - 1))) {
        if (gt((S.l["list_4"][S.v["var_1"] - 1] ?? ""), (S.l["list_4"][(S.v["var_1"] + 1) - 1] ?? ""))) {
          S.v["var_2"] = (S.l["list_4"][S.v["var_1"] - 1] ?? "");
          if (S.v["var_1"] > 0 && S.v["var_1"] <= S.l["list_4"].length) S.l["list_4"][S.v["var_1"] - 1] = (S.l["list_4"][(S.v["var_1"] + 1) - 1] ?? "");
          { const r0 = (S.v["var_1"] + 1); if (r0 <= S.l["list_4"].length) S.l["list_4"][r0 - 1] = S.v["var_2"]; }
          S.v["var_3"] = 1;
        }
        S.v["var_1"] = S.v["var_1"] + 1;
        if (th.warp === 0 && --rt.spin < 0) yield;
      }
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.v["var_0"] = 1;
    while (!(S.v["var_0"] > S.l["list_4"].length)) {
      S.l["list_y"].push((S.l["list_4"][S.v["var_0"] - 1] ?? ""));
      S.v["var_0"] = S.v["var_0"] + 1;
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
} },
];
})

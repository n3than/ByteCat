(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    for (let r0 = Math.round(5); r0 > 0; r0--) {
      S.v["var_0"] = S.v["var_0"] + 1;
      S.l["list_7"].push(("A" + ("" + S.v["var_0"])));
      if ((S.v["var_0"] === 3)) {
        rt.broadcast("go");
      }
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_7"].push("A done");
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    for (let r1 = Math.round(5); r1 > 0; r1--) {
      S.v["var_1"] = S.v["var_1"] + 1;
      S.l["list_7"].push(("B" + ("" + S.v["var_1"])));
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_7"].push("B done");
} },
{ target: 2, kind: "broadcast", arg: "go", fn: function* (t, th) {
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      S.v["var_2"] = S.v["var_2"] + 1;
      S.l["list_7"].push(("C" + ("" + S.v["var_2"])));
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_7"].push("C done");
} },
];
})

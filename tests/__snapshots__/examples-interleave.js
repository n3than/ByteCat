(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"];
    for (let r0 = Math.round(5); r0 > 0; r0--) {
      v0 = v0 + 1;
      S.l["list_7"].push(("A" + ("" + v0)));
      if ((v0 === 3)) {
        rt.broadcast("go");
      }
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    S.l["list_7"].push("A done");
    S.v["var_0"] = v0;
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_1"];
    for (let r1 = Math.round(5); r1 > 0; r1--) {
      v0 = v0 + 1;
      S.l["list_7"].push(("B" + ("" + v0)));
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_1"] = v0;
        yield;
        v0 = S.v["var_1"];
      }
    }
    S.l["list_7"].push("B done");
    S.v["var_1"] = v0;
} },
{ target: 2, kind: "broadcast", arg: "go", fn: function* (t, th) {
    let v0 = S.v["var_2"];
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      v0 = v0 + 1;
      S.l["list_7"].push(("C" + ("" + v0)));
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_2"] = v0;
        yield;
        v0 = S.v["var_2"];
      }
    }
    S.l["list_7"].push("C done");
    S.v["var_2"] = v0;
} },
];
})

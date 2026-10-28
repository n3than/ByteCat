(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "flag", fn: function* (t, th) {
    let v0 = t.v["var_1"];
    for (let r0 = Math.round(200); r0 > 0; r0--) {
      v0 = v0 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        t.v["var_1"] = v0;
        yield;
        v0 = t.v["var_1"];
      }
    }
    t.l["list_6"].push(("stage passes " + ("" + v0)));
    t.v["var_1"] = v0;
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"];
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      rt.setVisible(t, false);
      v0 = toNum(v0) + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    for (let r1 = Math.round(3); r1 > 0; r1--) {
      rt.goToFront(t);
      v0 = toNum(v0) + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    for (let r2 = Math.round(3); r2 > 0; r2--) {
      rt.nextCostume(t);
      rt.say(t, "say", v0);
      v0 = toNum(v0) + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    rt.setVisible(t, true);
    for (let r3 = Math.round(3); r3 > 0; r3--) {
      rt.nextCostume(t);
      v0 = toNum(v0) + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    for (let r4 = Math.round(3); r4 > 0; r4--) {
      rt.say(t, "say", v0);
      v0 = toNum(v0) + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0;
        yield;
        v0 = S.v["var_0"];
      }
    }
    rt.say(t, "say", "");
    rt.switchCostume(S, "night");
    S.v["var_0"] = v0;
    yield* rt.glide(t, 0.5, 100, 50);
    v0 = S.v["var_0"];
    S.v["var_0"] = v0;
    yield* rt.wait(0);
    v0 = S.v["var_0"];
    S.v["var_0"] = v0;
    yield* rt.wait(1);
    v0 = S.v["var_0"];
    v0 = toNum(v0) + toNum(random(7, 7));
    S.l["list_6"].push(("n " + ("" + v0)));
    S.l["list_6"].push(("x " + ("" + rt.coord(t.x))));
    S.v["var_0"] = v0;
} },
{ target: 2, kind: "flag", fn: function* (t, th) {
    rt.goToFront(t);
} },
];
})

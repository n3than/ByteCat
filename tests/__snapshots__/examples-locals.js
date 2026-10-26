(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th) {
  S.v["var_0"] = S.v["var_0"] + 100;
  S.v["var_3"] = S.v["var_3"] + S.v["var_0"];
}
function p1_1(t, th) {
  S.l["list_e"].push(("peek " + ("" + S.v["var_0"])));
}
function* p1_2(t, th) {
  yield* rt.wait(0);
}
function p1_3(t, th, a0) {
  let v0 = S.v["var_0"];
  v0 = 0;
  for (;;) {
    v0 = v0 + 1;
    if ((v0 === a0)) {
      S.v["var_0"] = v0;
      return;
    }
  }
  S.v["var_0"] = v0;
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"], v1 = t.v["var_4"], v2 = S.v["var_2"];
    for (let r0 = Math.round(4); r0 > 0; r0--) {
      v0 = v0 + 1;
      v1 = v1 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
        yield;
        v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      }
    }
    S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
    while (!(S.v["var_1"] === 1)) {
      yield rt.WAIT;
      v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
    }
    S.l["list_e"].push(("A sees " + ("" + v0)));
    v0 = 1;
    for (let r1 = Math.round(3); r1 > 0; r1--) {
      v0 = v0 + 1;
      S.v["var_0"] = v0;
      p1_0(t, th);
      v0 = S.v["var_0"];
      S.v["var_0"] = v0;
      p1_1(t, th);
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
        yield;
        v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      }
    }
    S.l["list_e"].push(("total " + ("" + S.v["var_3"])));
    v0 = 0;
    for (let r2 = Math.round(2); r2 > 0; r2--) {
      v0 = v0 + 1;
      S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
      yield* p1_2(t, th);
      v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      S.l["list_e"].push(("after pause " + ("" + v0)));
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
        yield;
        v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      }
    }
    S.v["var_0"] = v0;
    p1_3(t, th, 7);
    v0 = S.v["var_0"];
    S.l["list_e"].push(("counted " + ("" + v0)));
    S.l["list_e"].push(("mine " + ("" + v1)));
    for (let r3 = Math.round(2); r3 > 0; r3--) {
      v2 = v2 + 1;
      rt.broadcast("look");
      S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
      yield* rt.wait(0);
      v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      v2 = v2 + 10;
      rt.broadcast("look");
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
        yield;
        v0 = S.v["var_0"]; v1 = t.v["var_4"]; v2 = S.v["var_2"];
      }
    }
    S.l["list_e"].push(("done " + ("" + v2)));
    S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
    throw rt.STOP_ALL;
    S.v["var_0"] = v0; t.v["var_4"] = v1; S.v["var_2"] = v2;
} },
{ target: 2, kind: "broadcast", arg: "look", fn: function* (t, th) {
    S.l["list_e"].push(("look " + ("" + S.v["var_2"])));
} },
{ target: 2, kind: "flag", fn: function* (t, th) {
    let v0 = S.v["var_0"], v1 = t.v["var_5"];
    for (let r0 = Math.round(4); r0 > 0; r0--) {
      v0 = v0 + 10;
      v1 = v1 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        S.v["var_0"] = v0; t.v["var_5"] = v1;
        yield;
        v0 = S.v["var_0"]; v1 = t.v["var_5"];
      }
    }
    S.v["var_1"] = 1;
    S.v["var_0"] = v0; t.v["var_5"] = v1;
    while (!(v0 === 1)) {
      yield rt.WAIT;
      v0 = S.v["var_0"]; v1 = t.v["var_5"];
    }
    v0 = v0 + 1000;
    S.l["list_e"].push(("B mine " + ("" + v1)));
    S.v["var_0"] = v0; t.v["var_5"] = v1;
} },
];
})

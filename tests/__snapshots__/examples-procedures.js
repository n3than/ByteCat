(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function* p1_0(t, th, a0) {
  for (let r0 = Math.round(a0); r0 > 0; r0--) {
    S.l["list_e"].push("step");
    if (th.warp === 0 && --rt.spin < 0) yield;
  }
}
function* p1_1(t, th, a0) {
  if ((a0 === 0)) {
    S.l["list_e"].push("even");
  } else {
    yield* p1_5(t, th, (a0 - 1));
  }
}
function* p1_2(t, th, a0) {
  yield* p1_0(t, th, a0);
}
function p1_3(t, th, a0, a1) {
  S.v["var_0"] = (a0 + a1);
  if ((S.v["var_0"] > 100)) {
    return;
  }
  S.l["list_e"].push(("n " + ("" + S.v["var_0"])));
}
function* p1_4(t, th) {
  yield* rt.wait(0);
  p1_3(t, th, 1, 2);
}
function* p1_5(t, th, a0) {
  if ((a0 === 0)) {
    S.l["list_e"].push("odd");
  } else {
    yield* rt.wait(0);
    yield* p1_1(t, th, (a0 - 1));
  }
}
function p1_6(t, th, a0) {
  if ((a0 > 0)) {
    S.v["var_0"] = S.v["var_0"] + 1;
    p1_6(t, th, (a0 - 1));
  }
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    rt.broadcast("go");
    yield* p1_0(t, th, 2);
    th.warp++;
    try { yield* p1_2(t, th, 3); } finally { th.warp--; }
    yield* p1_4(t, th);
    p1_3(t, th, 200, 1);
    S.l["list_e"].push(("after stop " + ("" + S.v["var_0"])));
    yield* p1_1(t, th, 3);
    S.v["var_0"] = 0;
    p1_6(t, th, 500);
    S.l["list_e"].push(("count " + ("" + S.v["var_0"])));
} },
{ target: 2, kind: "broadcast", arg: "go", fn: function* (t, th) {
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      S.l["list_e"].push("tick");
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
} },
];
})

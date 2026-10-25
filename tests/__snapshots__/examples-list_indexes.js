(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function* p1_0(t, th, a0) {
  S.l["list_8"].length = 0;
  S.v["var_2"] = "1";
  while (!gt(S.v["var_2"], a0)) {
    S.l["list_8"].push((toNum(S.v["var_2"]) * 10));
    S.v["var_2"] = toNum(S.v["var_2"]) + 1;
    if (th.warp === 0) yield;
  }
}
function* p1_1(t, th, a0, a1) {
  yield* p1_0(t, th, a0);
  S.v["var_3"] = itemOf(S.l["list_8"], itemOf(S.l["list_7"], S.v["var_1"]));
  yield* p1_0(t, th, a0);
  deleteOf(S.l["list_8"], itemOf(S.l["list_7"], S.v["var_1"]));
  S.v["var_4"] = listContents(S.l["list_8"]);
  S.v["var_5"] = "-";
  if (eq(a1, 1)) {
    yield* p1_0(t, th, a0);
    insertAt(S.l["list_8"], itemOf(S.l["list_7"], S.v["var_1"]), "X");
    S.v["var_5"] = listContents(S.l["list_8"]);
  }
  yield* p1_0(t, th, a0);
  replaceAt(S.l["list_8"], itemOf(S.l["list_7"], S.v["var_1"]), "R");
  S.v["var_6"] = listContents(S.l["list_8"]);
  S.l["list_1g"].push(("len " + (toStr(a0) + (" idx " + (toStr(S.v["var_1"]) + (": item=" + (toStr(S.v["var_3"]) + (" delete=[" + (toStr(S.v["var_4"]) + ("] insert=[" + (toStr(S.v["var_5"]) + ("] replace=[" + (toStr(S.v["var_6"]) + "]")))))))))))));
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_7"].push("1");
    S.l["list_7"].push("2");
    S.l["list_7"].push("3");
    S.l["list_7"].push("4");
    S.l["list_7"].push("0");
    S.l["list_7"].push("-1");
    S.l["list_7"].push("0.5");
    S.l["list_7"].push("1.5");
    S.l["list_7"].push("3.9999");
    S.l["list_7"].push("2.5");
    S.l["list_7"].push("100000");
    S.l["list_7"].push((0 / 0));
    S.l["list_7"].push((1 / 0));
    S.l["list_7"].push(((-1) / 0));
    S.l["list_7"].push((0 * (-1)));
    S.l["list_7"].push("1");
    S.l["list_7"].push("1.0");
    S.l["list_7"].push(" 2 ");
    S.l["list_7"].push("3");
    S.l["list_7"].push("4");
    S.l["list_7"].push("last");
    S.l["list_7"].push("all");
    S.l["list_7"].push("");
    S.l["list_7"].push("abc");
    S.l["list_7"].push("0");
    S.v["var_0"] = "0";
    while (!gt(S.v["var_0"], 3)) {
      if (!eq(S.v["var_0"], 2)) {
        S.v["var_1"] = "1";
        while (!gt(S.v["var_1"], S.l["list_7"].length)) {
          yield* p1_1(t, th, S.v["var_0"], "1");
          S.v["var_1"] = toNum(S.v["var_1"]) + 1;
          if (th.warp === 0) yield;
        }
      }
      S.v["var_0"] = toNum(S.v["var_0"]) + 1;
      if (th.warp === 0) yield;
    }
    S.l["list_7"].length = 0;
    S.l["list_7"].push("random");
    S.l["list_7"].push("any");
    S.v["var_0"] = "0";
    while (!gt(S.v["var_0"], 1)) {
      S.v["var_1"] = "1";
      while (!gt(S.v["var_1"], S.l["list_7"].length)) {
        yield* p1_1(t, th, S.v["var_0"], (1 - toNum(S.v["var_0"])));
        S.v["var_1"] = toNum(S.v["var_1"]) + 1;
        if (th.warp === 0) yield;
      }
      S.v["var_0"] = toNum(S.v["var_0"]) + 1;
      if (th.warp === 0) yield;
    }
} },
];
})

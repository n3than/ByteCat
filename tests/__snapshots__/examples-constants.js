(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th, a0) {
  S.l["list_b"].push(("arg " + toStr(a0)));
  S.l["list_b"].push(toStr(a0).length);
  S.l["list_b"].push(eq(a0, 1));
  S.l["list_b"].push(lt(a0, 2));
}
function p1_1(t, th, a0) {
  rt.switchCostume(t, a0);
}
function p1_2(t, th, a0) {
  S.l["list_b"].push((toNum(a0) + toNum(a0)));
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_2"].push(5);
    S.l["list_2"].push(6);
    S.l["list_b"].push(listContents(S.l["list_2"]));
    S.l["list_3"].push(5);
    S.l["list_3"].push(6);
    S.l["list_b"].push(listContents(S.l["list_3"]));
    S.l["list_2"].push(7);
    S.l["list_b"].push(listContents(S.l["list_2"]));
    S.l["list_2"].length = 0;
    S.l["list_2"].push((1 + 2));
    S.l["list_2"].push((2 + 2));
    S.l["list_b"].push(listContents(S.l["list_2"]));
    S.l["list_2"].length = 0;
    S.l["list_2"].push(5);
    S.l["list_2"].push(10);
    S.l["list_b"].push(listContents(S.l["list_2"]));
    S.v["var_0"] = "1.0";
    S.l["list_b"].push(("v=" + toStr(S.v["var_0"])));
    S.l["list_b"].push(toStr(S.v["var_0"]).length);
    S.v["var_0"] = 1;
    S.l["list_b"].push(toStr(S.v["var_0"]).length);
    S.l["list_b"].push(letterOf(1, 10));
    S.l["list_b"].push(letterOf("2", 10));
    S.l["list_b"].push(letterOf(1, 1.5));
    S.l["list_b"].push(letterOf(1, (-3)));
    S.l["list_b"].push("1e3".length);
    S.l["list_b"].push("1e21".length);
    S.l["list_b"].push("0.5".length);
    S.l["list_b"].push(" 1".length);
    S.l["list_b"].push(("0.5" + "1.0"));
    S.l["list_b"].push(("-0" + "-0"));
    S.l["list_b"].push((1 === 1));
    S.l["list_b"].push((1 === 1));
    S.l["list_b"].push((1 < 2));
    S.l["list_b"].push((1 === 1));
    S.l["list_b"].push((1 === 1));
    S.l["list_b"].push((1 === 1));
    S.l["list_b"].push(("abc" < "1"));
    S.l["list_b"].push(("" === "0"));
    S.l["list_b"].push(("0" === ""));
    S.l["list_b"].push((10 < 9));
    S.l["list_b"].push((10 < 9));
    S.l["list_b"].push((1 + 2));
    S.l["list_b"].push((3 + 4));
    S.l["list_b"].push((1.5 * 2));
    S.l["list_b"].push((0.1 + 0.2));
    S.l["list_b"].push((10 / 4));
    S.l["list_b"].push(mod(7, 3));
    S.l["list_b"].push(mod((-7), 3));
    S.l["list_b"].push((1e+21 + 1));
    S.l["list_b"].push(Math.round(2.5));
    S.l["list_3"].length = 0;
    S.l["list_3"].push("a");
    S.l["list_3"].push("b");
    S.l["list_3"].push("c");
    S.l["list_b"].push(itemOf(S.l["list_3"], 1));
    S.l["list_b"].push(itemOf(S.l["list_3"], "1.0"));
    S.l["list_b"].push(itemOf(S.l["list_3"], "1.0"));
    S.l["list_b"].push(itemOf(S.l["list_3"], "2"));
    S.l["list_b"].push(itemOf(S.l["list_3"], "last"));
    S.l["list_b"].push(itemOf(S.l["list_3"], " 3"));
    insertAt(S.l["list_3"], "2", "X");
    S.l["list_b"].push(indexOf(S.l["list_3"], "X"));
    S.l["list_b"].push(indexOf(S.l["list_3"], "2"));
    S.l["list_2"].length = 0;
    S.l["list_2"].push(1);
    S.l["list_2"].push("2");
    S.l["list_b"].push(listContains(S.l["list_2"], 1));
    S.l["list_b"].push(listContains(S.l["list_2"], "1.0"));
    S.l["list_b"].push(indexOf(S.l["list_2"], "2"));
    p1_0(t, th, 1);
    p1_0(t, th, 1);
    p1_0(t, th, "1.0");
    p1_0(t, th, " 1");
    p1_2(t, th, 21);
    p1_2(t, th, 21);
    rt.switchCostume(t, "alpha");
    rt.switchCostume(t, "2");
    S.l["list_b"].push(rt.costumeName(t));
    S.l["list_b"].push((t.costume + 1));
    S.l["list_3"].length = 0;
    S.l["list_3"].push("2");
    rt.switchCostume(t, "alpha");
    rt.switchCostume(t, itemOf(S.l["list_3"], 1));
    S.l["list_b"].push(("item " + rt.costumeName(t)));
    rt.switchCostume(t, "alpha");
    p1_1(t, th, "2");
    S.l["list_b"].push(("arg " + rt.costumeName(t)));
    rt.switchCostume(t, "alpha");
    S.v["var_1"] = "2";
    rt.switchCostume(t, S.v["var_1"]);
    S.l["list_b"].push(("a=2 " + rt.costumeName(t)));
    rt.switchCostume(t, "alpha");
    S.v["var_1"] = "2";
    rt.switchCostume(t, S.v["var_1"]);
    S.l["list_b"].push(("a=text2 " + rt.costumeName(t)));
    rt.switchCostume(t, "alpha");
    S.v["var_1"] = 3;
    rt.switchCostume(t, S.v["var_1"]);
    S.l["list_b"].push(("a=3 " + rt.costumeName(t)));
    rt.switchCostume(t, "alpha");
    S.v["var_1"] = (1 + 1);
    rt.switchCostume(t, S.v["var_1"]);
    S.l["list_b"].push(("a=1+1 " + rt.costumeName(t)));
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "flag", fn: function* (t, th) {
    while (!(t.v["var_0"] === 1)) yield rt.WAIT;
    t.l["list_5"].push("a");
    t.v["var_0"] = 2;
} },
{ target: 0, kind: "flag", fn: function* (t, th) {
    t.v["var_0"] = 1;
    while (!(t.v["var_0"] === 2)) yield rt.WAIT;
    t.l["list_5"].push("b");
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 6, kind: "flag", fn: function* (t, th) {
    rt.goToFront(t);
} },
{ target: 8, kind: "flag", fn: function* (t, th) {
    rt.switchCostume(t, "second");
} },
{ target: 9, kind: "flag", fn: function* (t, th) {
    rt.setDirection(t, t.direction + 90);
    S.l["list_8"].push("rendered");
} },
];
})

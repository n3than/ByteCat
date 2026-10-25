(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    for (let r0 = Math.round(20); r0 > 0; r0--) {
      rt.move(t, 20);
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_4"].push("done");
} },
];
})

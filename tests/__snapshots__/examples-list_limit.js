(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
function p1_0(t, th) {
  for (let r0 = Math.round(200005); r0 > 0; r0--) {
    S.l["list_0"].push(1);
  }
  insertAt(S.l["list_0"], 1, 2);
}
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    p1_0(t, th);
    S.l["list_9"].push(S.l["list_0"].length);
    S.l["list_9"].push((S.l["list_0"][0] ?? ""));
} },
];
})

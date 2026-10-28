(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "flag", fn: function* (t, th) {
    t.l["list_2"].push("stage flag");
    yield* rt.broadcastAndWait("go");
    yield* rt.broadcastAndWait("front");
    yield* rt.broadcastAndWait("go");
} },
{ target: 0, kind: "broadcast", arg: "go", fn: function* (t, th) {
    t.l["list_2"].push("stage go");
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_2"].push("Back flag 1");
} },
{ target: 1, kind: "broadcast", arg: "go", fn: function* (t, th) {
    S.l["list_2"].push("Back go");
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_2"].push("Back flag 2");
} },
{ target: 1, kind: "broadcast", arg: "front", fn: function* (t, th) {
    rt.goToFront(t);
} },
{ target: 2, kind: "flag", fn: function* (t, th) {
    S.l["list_2"].push("Middle flag");
} },
{ target: 2, kind: "broadcast", arg: "go", fn: function* (t, th) {
    S.l["list_2"].push("Middle go");
} },
{ target: 3, kind: "broadcast", arg: "go", fn: function* (t, th) {
    S.l["list_2"].push("Front go");
} },
{ target: 3, kind: "flag", fn: function* (t, th) {
    S.l["list_2"].push("Front flag");
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    rt.broadcast("work");
    rt.broadcast("watch");
    rt.broadcast("restart");
} },
{ target: 1, kind: "broadcast", arg: "work", fn: function* (t, th) {
    S.l["list_9"].push("work start");
    for (let r0 = Math.round(2); r0 > 0; r0--) {
      S.l["list_9"].push("work tick");
      if (th.warp === 0) yield;
    }
} },
{ target: 1, kind: "broadcast", arg: "watch", fn: function* (t, th) {
    for (let r1 = Math.round(3); r1 > 0; r1--) {
      S.l["list_9"].push("watch");
      if (th.warp === 0) yield;
    }
} },
{ target: 1, kind: "broadcast", arg: "restart", fn: function* (t, th) {
    for (let r2 = Math.round(1); r2 > 0; r2--) {
      S.l["list_9"].push("restart wait");
      if (th.warp === 0) yield;
    }
    rt.broadcast("work");
    rt.broadcast("late");
} },
{ target: 1, kind: "broadcast", arg: "late", fn: function* (t, th) {
    for (let r3 = Math.round(2); r3 > 0; r3--) {
      S.l["list_9"].push("late");
      if (th.warp === 0) yield;
    }
} },
];
})

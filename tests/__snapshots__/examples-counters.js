(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "broadcast", arg: "bump", fn: function* (t, th) {
    t.l["list_3"].push(("stage sees " + ("" + rt.counter)));
    rt.counter++;
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_3"].push(("start " + ("" + rt.counter)));
    rt.counter++;
    rt.counter++;
    rt.counter++;
    S.l["list_3"].push(("counted " + ("" + rt.counter)));
    rt.counter = 0;
    S.l["list_3"].push(("cleared " + ("" + rt.counter)));
    rt.counter++;
    S.l["list_3"].push(("again " + ("" + rt.counter)));
    S.l["list_3"].push((rt.counter + 41));
    yield* rt.broadcastAndWait("bump");
    S.l["list_3"].push(("after sprite and stage " + ("" + rt.counter)));
    rt.counter = 0;
    rt.counter++;
    rt.counter++;
    S.l["list_3"].push(("inside " + ("" + rt.counter)));
    S.l["list_3"].push(("outside " + ("" + rt.counter)));
    rt.counter = 0;
    rt.broadcast("loop");
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      rt.counter++;
      S.l["list_3"].push(("A loop " + ("" + rt.counter)));
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_3"].push("A done");
    yield* rt.wait(0.5);
    throw rt.STOP_ALL;
} },
{ target: 1, kind: "broadcast", arg: "bump", fn: function* (t, th) {
    S.l["list_3"].push(("sprite sees " + ("" + rt.counter)));
    rt.counter++;
    rt.counter++;
} },
{ target: 2, kind: "broadcast", arg: "loop", fn: function* (t, th) {
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      S.l["list_3"].push(("B loop " + ("" + rt.counter)));
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
    S.l["list_3"].push("B done");
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "broadcast", arg: "go", fn: function* (t, th) {
    t.v["var_0"] = t.v["var_0"] + 1;
    t.l["list_5"].push(t.v["var_0"]);
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    yield* rt.sayFor(t, "say", "hi", 0.1);
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      yield* rt.wait(0.07);
      rt.broadcast("go");
      if (th.warp === 0 && --rt.spin < 0) yield;
    }
} },
];
})

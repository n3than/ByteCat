(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "flag", fn: function* (t, th) {
    let v0 = t.v["var_0"];
    v0 = v0 + 1;
    t.l["list_4"].push(v0);
    for (;;) {
      v0 = v0 + 1;
      if (th.warp === 0 && --rt.spin < 0) {
        t.v["var_0"] = v0;
        yield;
        v0 = t.v["var_0"];
      }
    }
    t.v["var_0"] = v0;
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    throw rt.STOP_ALL;
} },
];
})

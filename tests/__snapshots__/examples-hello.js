(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    S.l["list_3"].push("hello");
    for (let r0 = Math.round(3); r0 > 0; r0--) {
      S.v["var_0"] = toNum(S.v["var_0"]) + 1;
      S.l["list_3"].push(("count is " + toStr(S.v["var_0"])));
      if (th.warp === 0) yield;
    }
    rt.say(t, "say", "done");
} },
];
})

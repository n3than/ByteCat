(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "key", arg: "any", restart: false, fn: function* (t, th) {
    S.l["list_3"].push("any");
} },
{ target: 1, kind: "key", arg: "space", restart: false, fn: function* (t, th) {
    S.l["list_3"].push("space start");
    yield* rt.wait(0.2);
    S.l["list_3"].push("space end");
    S.v["var_0"] = S.v["var_0"] + 1;
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    while (!(S.v["var_0"] === 2)) yield rt.WAIT;
    throw rt.STOP_ALL;
} },
];
})

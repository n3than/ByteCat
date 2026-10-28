(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "click", fn: function* (t, th) {
    t.v["var_0"] = t.v["var_0"] + 1;
    t.l["list_4"].push("stage clicked");
} },
{ target: 1, kind: "click", fn: function* (t, th) {
    S.v["var_0"] = S.v["var_0"] + 1;
    S.l["list_4"].push("cat clicked");
} },
{ target: 1, kind: "key", arg: "space", restart: false, fn: function* (t, th) {
    S.v["var_0"] = S.v["var_0"] + 1;
    S.l["list_4"].push("space");
} },
{ target: 1, kind: "key", arg: "a", restart: false, fn: function* (t, th) {
    S.v["var_0"] = S.v["var_0"] + 1;
    S.l["list_4"].push("a");
} },
{ target: 1, kind: "flag", fn: function* (t, th) {
    while (!rt.keyPressed("left arrow")) yield rt.WAIT;
    S.l["list_4"].push("left arrow held");
    while (!(S.v["var_0"] === 4)) yield rt.WAIT;
    S.l["list_4"].push("all inputs received");
    throw rt.STOP_ALL;
} },
];
})

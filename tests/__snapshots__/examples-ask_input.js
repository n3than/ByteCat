(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 0, kind: "flag", fn: function* (t, th) {
    yield* rt.wait(0.2);
    t.l["list_3"].push(("mouse " + (("" + rt.mouse.x) + (" " + ("" + rt.mouse.y)))));
    yield* rt.ask(t, "name?");
    t.l["list_3"].push(("hello " + rt.answer));
    throw rt.STOP_ALL;
} },
];
})

(function (rt) {
"use strict";
const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,
  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;
const S = rt.stage;
return [
{ target: 1, kind: "flag", fn: function* (t, th) {
    rt.setXY(t, 0, 0);
    rt.move(t, 30);
    S.l["list_4"].push(rt.coord(t.x));
    rt.setDirection(t, t.direction + 90);
    rt.move(t, 20);
    S.l["list_4"].push(rt.coord(t.y));
    S.l["list_4"].push(t.direction);
    rt.switchCostume(t, "box");
    S.l["list_4"].push(rt.costumeName(t));
    rt.nextCostume(t);
    S.l["list_4"].push((t.costume + 1));
} },
];
})

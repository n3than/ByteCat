import { asName, numEx, strEx } from "../cast.js";
import { menu, missing, reporter, statement, type Extension } from "./api.js";

const LEGACY = "Scratch 2 leftover; a no-op in TurboWarp";
const SIZE = "only clamps at 5%; TurboWarp clamps by costume and stage size";

export const looks: Extension = {
  id: "looks",
  name: "Looks",
  blocks: {
    looks_sayforsecs: statement(
      (b, g) => g.y(`yield* rt.sayFor(t, "say", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
      { yields: "wait", uses: ["sayFor"] },
    ),
    looks_say: statement((b, g) => [`rt.say(t, "say", ${g.any(b, "MESSAGE")});`], { uses: ["say"] }),
    looks_thinkforsecs: statement(
      (b, g) => g.y(`yield* rt.sayFor(t, "think", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
      { yields: "wait", uses: ["sayFor"] },
    ),
    looks_think: statement((b, g) => [`rt.say(t, "think", ${g.any(b, "MESSAGE")});`], { uses: ["say"] }),
    looks_switchcostumeto: statement((b, g) => [`rt.switchCostume(t, ${asName(g.input(b, "COSTUME"))});`], { uses: ["switchCostume"] }),
    looks_nextcostume: statement(() => ["rt.nextCostume(t);"], { uses: ["nextCostume"] }),
    looks_switchbackdropto: statement((b, g) => [`rt.switchCostume(S, ${asName(g.input(b, "BACKDROP"))});`], { uses: ["switchCostume"] }),
    looks_switchbackdroptoandwait: missing("statement", "waits for the scripts its backdrop hat starts"),
    looks_nextbackdrop: statement(() => ["rt.nextCostume(S);"], { uses: ["nextCostume"] }),
    looks_changesizeby: statement((b, g) => [`rt.setSize(t, t.size + ${g.num(b, "CHANGE")});`], { uses: ["setSize"], partial: SIZE }),
    looks_setsizeto: statement((b, g) => [`rt.setSize(t, ${g.num(b, "SIZE")});`], { uses: ["setSize"], partial: SIZE }),
    looks_changeeffectby: missing("statement", "no effect state or drawing yet"),
    looks_seteffectto: missing("statement", "no effect state or drawing yet"),
    looks_cleargraphiceffects: missing("statement", "no effect state or drawing yet"),
    looks_show: statement(() => ["rt.setVisible(t, true);"], { uses: ["setVisible"] }),
    looks_hide: statement(() => ["rt.setVisible(t, false);"], { uses: ["setVisible"] }),
    looks_gotofrontback: statement((b, g) => (g.field(b, "FRONT_BACK") === "front" ? ["rt.goToFront(t);"] : undefined), {
      uses: ["goToFront"],
      partial: "front only; go to back layer is reported as unsupported",
    }),
    looks_goforwardbackwardlayers: missing("statement", "no layer list yet"),
    looks_costumenumbername: reporter(
      (b, g) => (g.field(b, "NUMBER_NAME") === "name" ? strEx("rt.costumeName(t)") : numEx("(t.costume + 1)")),
      { uses: ["costumeName"] },
    ),
    looks_backdropnumbername: reporter(
      (b, g) => (g.field(b, "NUMBER_NAME") === "name" ? strEx("rt.costumeName(S)") : numEx("(S.costume + 1)")),
      { uses: ["costumeName"] },
    ),
    looks_size: reporter(() => numEx("Math.round(t.size)")),
    looks_costume: menu("COSTUME"),
    looks_backdrops: menu("BACKDROP"),
    looks_hideallsprites: missing("statement", LEGACY, { hidden: true }),
    looks_changestretchby: missing("statement", LEGACY, { hidden: true }),
    looks_setstretchto: missing("statement", LEGACY, { hidden: true }),
  },
};

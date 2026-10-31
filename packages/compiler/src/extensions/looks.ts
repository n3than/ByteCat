import { asName, numEx, strEx } from "../cast.js";
import { menu, missing, reporter, statement, type Extension } from "./api.js";

const LEGACY = "Scratch 2 leftover; a no-op in TurboWarp";
const SIZE = "only clamps at 5%; TurboWarp clamps by costume and stage size";

export const looks: Extension = {
  id: "looks",
  name: "Looks",
  runtime: "@bytecat/runtime/looks",
  blocks: {
    looks_sayforsecs: statement(
      (b, g) => g.y(`yield* sayFor(rt, t, "say", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
      { yields: "wait", uses: ["sayFor"] },
    ),
    looks_say: statement((b, g) => [`say(rt, t, "say", ${g.any(b, "MESSAGE")});`], { uses: ["say"] }),
    looks_thinkforsecs: statement(
      (b, g) => g.y(`yield* sayFor(rt, t, "think", ${g.any(b, "MESSAGE")}, ${g.num(b, "SECS")});`),
      { yields: "wait", uses: ["sayFor"] },
    ),
    looks_think: statement((b, g) => [`say(rt, t, "think", ${g.any(b, "MESSAGE")});`], { uses: ["say"] }),
    looks_switchcostumeto: statement((b, g) => [`switchCostume(rt, t, ${asName(g.menu(b, "COSTUME"))});`], { uses: ["switchCostume"] }),
    looks_nextcostume: statement(() => ["nextCostume(rt, t);"], { uses: ["nextCostume"] }),
    looks_switchbackdropto: statement((b, g) => [`switchCostume(rt, S, ${asName(g.menu(b, "BACKDROP"))});`], { uses: ["switchCostume"] }),
    looks_switchbackdroptoandwait: missing("statement", "waits for the scripts its backdrop hat starts"),
    looks_nextbackdrop: statement(() => ["nextCostume(rt, S);"], { uses: ["nextCostume"] }),
    looks_changesizeby: statement((b, g) => [`setSize(rt, t, t.size + ${g.num(b, "CHANGE")});`], { uses: ["setSize"], partial: SIZE }),
    looks_setsizeto: statement((b, g) => [`setSize(rt, t, ${g.num(b, "SIZE")});`], { uses: ["setSize"], partial: SIZE }),
    looks_changeeffectby: missing("statement", "no effect state or drawing yet"),
    looks_seteffectto: missing("statement", "no effect state or drawing yet"),
    looks_cleargraphiceffects: missing("statement", "no effect state or drawing yet"),
    looks_show: statement(() => ["setVisible(rt, t, true);"], { uses: ["setVisible"] }),
    looks_hide: statement(() => ["setVisible(rt, t, false);"], { uses: ["setVisible"] }),
    looks_gotofrontback: statement((b, g) => [g.field(b, "FRONT_BACK") === "front" ? "goToFront(rt, t);" : "goToBack(rt, t);"], {
      uses: ["goToFront", "goToBack"],
    }),
    // Backward is the negated number, so a literal stays a literal.
    looks_goforwardbackwardlayers: statement(
      (b, g) => {
        const n = g.num(b, "NUM");
        if (g.field(b, "FORWARD_BACKWARD") !== "backward") return [`moveLayers(rt, t, ${n});`];
        return [`moveLayers(rt, t, ${/^\d[\d.]*$/.test(n) ? `-${n}` : `-(${n})`});`];
      },
      { uses: ["moveLayers"] },
    ),
    looks_costumenumbername: reporter(
      (b, g) => (g.field(b, "NUMBER_NAME") === "name" ? strEx("costumeName(t)") : numEx("(t.costume + 1)")),
      { uses: ["costumeName"] },
    ),
    looks_backdropnumbername: reporter(
      (b, g) => (g.field(b, "NUMBER_NAME") === "name" ? strEx("costumeName(S)") : numEx("(S.costume + 1)")),
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

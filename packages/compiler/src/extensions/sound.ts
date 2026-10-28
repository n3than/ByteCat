import { menu, missing, type Extension } from "./api.js";

const NO_AUDIO = "no audio engine; sound assets are not loaded";

export const sound: Extension = {
  id: "sound",
  name: "Sound",
  blocks: {
    sound_playuntildone: missing("statement", `${NO_AUDIO}; must wait for the sound's length`),
    sound_play: missing("statement", NO_AUDIO),
    sound_stopallsounds: missing("statement", NO_AUDIO),
    sound_changeeffectby: missing("statement", "pitch and pan effects; no audio engine"),
    sound_seteffectto: missing("statement", "pitch and pan effects; no audio engine"),
    sound_cleareffects: missing("statement", "pitch and pan effects; no audio engine"),
    sound_changevolumeby: missing("statement", "no volume state yet"),
    sound_setvolumeto: missing("statement", "no volume state yet"),
    sound_volume: missing("reporter", "no volume state yet"),
    sound_sounds_menu: menu("SOUND_MENU"),
    sound_beats_menu: menu("BEATS", { hidden: true }),
    sound_effects_menu: menu("EFFECT", { hidden: true }),
  },
};

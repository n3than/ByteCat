import type { CompactPrimitive } from "@bytecat/sb3";

/** How one argument of a builtin maps onto a Scratch input or field. */
export type Slot =
  | { kind: "value"; input: string; prim: 4 | 5 | 6 | 7 | 8 | 10; default?: string }
  | { kind: "bool"; input: string }
  | { kind: "menu"; input: string; shadow: string; field: string; default: string }
  | { kind: "broadcast"; input: string }
  | { kind: "field"; field: string; values: readonly string[] };

export interface Builtin {
  opcode: string;
  slots: Slot[];
  /** Fields that are always set to a fixed value, e.g. the mathop operator. */
  fixed?: Record<string, string>;
  /** Reporters only: whether the block is hexagonal (boolean) or round (value). */
  returns?: "value" | "bool";
  spriteOnly?: boolean;
  /** One-line description, used to generate the reference table in docs. */
  doc: string;
}

const num = (input: string, def = "0"): Slot => ({ kind: "value", input, prim: 4, default: def });
const positive = (input: string, def = "1"): Slot => ({ kind: "value", input, prim: 5, default: def });
const whole = (input: string, def = "1"): Slot => ({ kind: "value", input, prim: 6, default: def });
const angle = (input: string, def = "90"): Slot => ({ kind: "value", input, prim: 8, default: def });
const text = (input: string, def = ""): Slot => ({ kind: "value", input, prim: 10, default: def });
const bool = (input: string): Slot => ({ kind: "bool", input });

/** Statement builtins, keyed by name. A name can have several overloads with different arity. */
export const STATEMENTS: Record<string, Builtin[]> = {
  move: [{ opcode: "motion_movesteps", slots: [num("STEPS", "10")], spriteOnly: true, doc: "move (steps) steps" }],
  turn_right: [{ opcode: "motion_turnright", slots: [num("DEGREES", "15")], spriteOnly: true, doc: "turn right (degrees)" }],
  turn_left: [{ opcode: "motion_turnleft", slots: [num("DEGREES", "15")], spriteOnly: true, doc: "turn left (degrees)" }],
  goto: [{ opcode: "motion_gotoxy", slots: [num("X"), num("Y")], spriteOnly: true, doc: "go to x: (x) y: (y)" }],
  glide: [{ opcode: "motion_glidesecstoxy", slots: [num("SECS", "1"), num("X"), num("Y")], spriteOnly: true, doc: "glide (secs) secs to x: (x) y: (y)" }],
  point: [{ opcode: "motion_pointindirection", slots: [angle("DIRECTION")], spriteOnly: true, doc: "point in direction (degrees)" }],
  change_x: [{ opcode: "motion_changexby", slots: [num("DX", "10")], spriteOnly: true, doc: "change x by (n)" }],
  set_x: [{ opcode: "motion_setx", slots: [num("X")], spriteOnly: true, doc: "set x to (n)" }],
  change_y: [{ opcode: "motion_changeyby", slots: [num("DY", "10")], spriteOnly: true, doc: "change y by (n)" }],
  set_y: [{ opcode: "motion_sety", slots: [num("Y")], spriteOnly: true, doc: "set y to (n)" }],
  bounce: [{ opcode: "motion_ifonedgebounce", slots: [], spriteOnly: true, doc: "if on edge, bounce" }],
  rotation_style: [{
    opcode: "motion_setrotationstyle",
    slots: [{ kind: "field", field: "STYLE", values: ["left-right", "don't rotate", "all around"] }],
    spriteOnly: true,
    doc: 'set rotation style ["left-right" | "don\'t rotate" | "all around"]',
  }],

  say: [
    { opcode: "looks_say", slots: [text("MESSAGE", "Hello!")], spriteOnly: true, doc: "say (message)" },
    { opcode: "looks_sayforsecs", slots: [text("MESSAGE", "Hello!"), num("SECS", "2")], spriteOnly: true, doc: "say (message) for (secs) seconds" },
  ],
  think: [
    { opcode: "looks_think", slots: [text("MESSAGE", "Hmm...")], spriteOnly: true, doc: "think (message)" },
    { opcode: "looks_thinkforsecs", slots: [text("MESSAGE", "Hmm..."), num("SECS", "2")], spriteOnly: true, doc: "think (message) for (secs) seconds" },
  ],
  switch_costume: [{
    opcode: "looks_switchcostumeto",
    slots: [{ kind: "menu", input: "COSTUME", shadow: "looks_costume", field: "COSTUME", default: "" }],
    spriteOnly: true,
    doc: "switch costume to (name)",
  }],
  next_costume: [{ opcode: "looks_nextcostume", slots: [], spriteOnly: true, doc: "next costume" }],
  switch_backdrop: [{
    opcode: "looks_switchbackdropto",
    slots: [{ kind: "menu", input: "BACKDROP", shadow: "looks_backdrops", field: "BACKDROP", default: "" }],
    doc: "switch backdrop to (name)",
  }],
  next_backdrop: [{ opcode: "looks_nextbackdrop", slots: [], doc: "next backdrop" }],
  change_size: [{ opcode: "looks_changesizeby", slots: [num("CHANGE", "10")], spriteOnly: true, doc: "change size by (n)" }],
  set_size: [{ opcode: "looks_setsizeto", slots: [num("SIZE", "100")], spriteOnly: true, doc: "set size to (n) %" }],
  show: [{ opcode: "looks_show", slots: [], spriteOnly: true, doc: "show" }],
  hide: [{ opcode: "looks_hide", slots: [], spriteOnly: true, doc: "hide" }],
  go_to_front: [{ opcode: "looks_gotofrontback", slots: [], fixed: { FRONT_BACK: "front" }, spriteOnly: true, doc: "go to front layer" }],

  broadcast: [{ opcode: "event_broadcast", slots: [{ kind: "broadcast", input: "BROADCAST_INPUT" }], doc: "broadcast (message)" }],
  broadcast_wait: [{ opcode: "event_broadcastandwait", slots: [{ kind: "broadcast", input: "BROADCAST_INPUT" }], doc: "broadcast (message) and wait" }],

  wait: [{ opcode: "control_wait", slots: [positive("DURATION")], doc: "wait (secs) seconds" }],
  wait_until: [{ opcode: "control_wait_until", slots: [bool("CONDITION")], doc: "wait until <condition>" }],
  stop: [{
    opcode: "control_stop",
    slots: [{ kind: "field", field: "STOP_OPTION", values: ["all", "this script", "other scripts in sprite"] }],
    doc: 'stop ["all" | "this script" | "other scripts in sprite"]',
  }],

  ask: [{ opcode: "sensing_askandwait", slots: [text("QUESTION", "What's your name?")], doc: "ask (question) and wait" }],
  reset_timer: [{ opcode: "sensing_resettimer", slots: [], doc: "reset timer" }],
};

const MATHOPS = {
  abs: "abs", floor: "floor", ceiling: "ceiling", sqrt: "sqrt",
  sin: "sin", cos: "cos", tan: "tan", asin: "asin", acos: "acos", atan: "atan",
  ln: "ln", log10: "log", exp: "e ^", pow10: "10 ^",
} as const;

/** Reporter builtins, keyed by name. */
export const REPORTERS: Record<string, Builtin[]> = {
  random: [{ opcode: "operator_random", slots: [num("FROM", "1"), num("TO", "10")], returns: "value", doc: "pick random (from) to (to)" }],
  letter: [{ opcode: "operator_letter_of", slots: [whole("LETTER"), text("STRING", "apple")], returns: "value", doc: "letter (index) of (text)" }],
  length: [{ opcode: "operator_length", slots: [text("STRING", "apple")], returns: "value", doc: "length of (text)" }],
  contains: [{ opcode: "operator_contains", slots: [text("STRING1", "apple"), text("STRING2", "a")], returns: "bool", doc: "<(text) contains (part)?>" }],
  round: [{ opcode: "operator_round", slots: [num("NUM")], returns: "value", doc: "round (n)" }],
  ...Object.fromEntries(
    Object.entries(MATHOPS).map(([name, op]) => [
      name,
      [{ opcode: "operator_mathop", slots: [num("NUM")], fixed: { OPERATOR: op }, returns: "value", doc: `[${op}] of (n)` } satisfies Builtin],
    ]),
  ),

  x_position: [{ opcode: "motion_xposition", slots: [], returns: "value", spriteOnly: true, doc: "x position" }],
  y_position: [{ opcode: "motion_yposition", slots: [], returns: "value", spriteOnly: true, doc: "y position" }],
  direction: [{ opcode: "motion_direction", slots: [], returns: "value", spriteOnly: true, doc: "direction" }],
  costume_number: [{ opcode: "looks_costumenumbername", slots: [], fixed: { NUMBER_NAME: "number" }, returns: "value", spriteOnly: true, doc: "costume [number]" }],
  costume_name: [{ opcode: "looks_costumenumbername", slots: [], fixed: { NUMBER_NAME: "name" }, returns: "value", spriteOnly: true, doc: "costume [name]" }],
  backdrop_number: [{ opcode: "looks_backdropnumbername", slots: [], fixed: { NUMBER_NAME: "number" }, returns: "value", doc: "backdrop [number]" }],
  backdrop_name: [{ opcode: "looks_backdropnumbername", slots: [], fixed: { NUMBER_NAME: "name" }, returns: "value", doc: "backdrop [name]" }],
  size: [{ opcode: "looks_size", slots: [], returns: "value", spriteOnly: true, doc: "size" }],

  timer: [{ opcode: "sensing_timer", slots: [], returns: "value", doc: "timer" }],
  answer: [{ opcode: "sensing_answer", slots: [], returns: "value", doc: "answer" }],
  mouse_x: [{ opcode: "sensing_mousex", slots: [], returns: "value", doc: "mouse x" }],
  mouse_y: [{ opcode: "sensing_mousey", slots: [], returns: "value", doc: "mouse y" }],
  mouse_down: [{ opcode: "sensing_mousedown", slots: [], returns: "bool", doc: "<mouse down?>" }],
  key_pressed: [{
    opcode: "sensing_keypressed",
    slots: [{ kind: "menu", input: "KEY_OPTION", shadow: "sensing_keyoptions", field: "KEY_OPTION", default: "space" }],
    returns: "bool",
    doc: "<key (name) pressed?>",
  }],
  days_since_2000: [{ opcode: "sensing_dayssince2000", slots: [], returns: "value", doc: "days since 2000" }],
  username: [{ opcode: "sensing_username", slots: [], returns: "value", doc: "username" }],
};

/** The shadow primitive a value slot falls back to when a reporter is dropped into it. */
export function defaultShadow(slot: Extract<Slot, { kind: "value" }>): CompactPrimitive {
  return [slot.prim, slot.default ?? ""];
}

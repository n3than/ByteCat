import type { Block, CompactPrimitive, Input, InputValue, ProjectJson, Target } from "@bytecat/sb3";

/** Static type of a generated expression, used to skip casts that cannot change the value. */
type Type = "num" | "str" | "bool" | "any";

interface Ex {
  c: string; // JavaScript code
  t: Type;
  /** Set when the value is a literal known at compile time. */
  k?: string;
}

interface Proc {
  fn: string;
  params: string[];
  warp: boolean;
  /** True when the body can never yield, so it compiles to a plain function instead of a generator. */
  sync: boolean;
}

export interface CompileResult {
  /** Source of a `function (rt) { ... }` expression returning the program's hats. */
  code: string;
  /** Blocks the compiler does not support. They compile to no-ops or empty values. */
  warnings: string[];
}

const LOOP_YIELD = "if (th.warp === 0) yield;";

/** Compiles every script in a project into one JavaScript factory function. */
export function compileProject(project: ProjectJson): CompileResult {
  const out: string[] = [];
  const warnings = new Set<string>();
  const hats: string[] = [];
  const stage = project.targets[0];
  const prelude: string[] = [];

  project.targets.forEach((target, index) => {
    const gen = new TargetCodegen(target, index, stage, warnings, prelude);
    out.push(...gen.procedures());
    hats.push(...gen.hats());
  });

  const code = [
    "(function (rt) {",
    '"use strict";',
    "const { toNum, toStr, toBool, eq, lt, gt, mod, random, letterOf, contains, mathop,",
    "  itemOf, deleteOf, insertAt, replaceAt, indexOf, listContains, listContents } = rt.ops;",
    "const S = rt.stage;",
    ...prelude,
    ...out,
    "return [",
    ...hats.map((h) => h + ","),
    "];",
    "})",
  ].join("\n");
  return { code, warnings: [...warnings].sort() };
}

class TargetCodegen {
  private readonly blocks: Record<string, Block>;
  private readonly procs = new Map<string, Proc>();
  private params = new Map<string, string>();
  private tmp = 0;
  /** Set while compiling the body of a warp procedure, where loops never yield. */
  private inWarp = false;
  /** Set when the code compiled since the last reset can yield. */
  private yields = false;

  constructor(
    private readonly target: Target,
    private readonly index: number,
    private readonly stage: Target,
    private readonly warnings: Set<string>,
    private readonly prelude: string[],
  ) {
    this.blocks = target.blocks;
    let n = 0;
    for (const block of Object.values(this.blocks)) {
      if (block.opcode !== "procedures_prototype" || !block.mutation?.proccode) continue;
      const names = JSON.parse(block.mutation.argumentnames ?? "[]") as string[];
      if (this.procs.has(block.mutation.proccode)) continue;
      this.procs.set(block.mutation.proccode, {
        fn: `p${index}_${n++}`,
        params: names,
        warp: block.mutation.warp === "true" || (block.mutation.warp as unknown) === true,
        sync: true,
      });
    }
  }

  // ---- top level ----

  procedures(): string[] {
    const defs: [Proc, Block][] = [];
    for (const block of Object.values(this.blocks)) {
      if (block.opcode !== "procedures_definition") continue;
      const protoId = block.inputs.custom_block?.[1];
      const proto = typeof protoId === "string" ? this.blocks[protoId] : undefined;
      const proc = proto?.mutation?.proccode ? this.procs.get(proto.mutation.proccode) : undefined;
      if (proc) defs.push([proc, block]);
    }
    // Every procedure starts out sync. Compiling a body that can yield (a wait, a loop outside
    // warp, or a call to a procedure that can yield) makes it a generator, which can make its
    // callers generators too, so repeat until nothing changes.
    let bodies: string[][];
    for (;;) {
      let changed = false;
      bodies = defs.map(([proc, block]) => {
        const body = this.procBody(proc, block);
        if (this.yields && proc.sync) {
          proc.sync = false;
          changed = true;
        }
        return body;
      });
      if (!changed) break;
    }
    const out: string[] = [];
    defs.forEach(([proc], i) => {
      const args = proc.params.map((_, j) => `a${j}`);
      out.push(`function${proc.sync ? "" : "*"} ${proc.fn}(${["t", "th", ...args].join(", ")}) {`);
      out.push(...indent(bodies[i]!));
      out.push("}");
    });
    return out;
  }

  private procBody(proc: Proc, block: Block): string[] {
    this.params = new Map(proc.params.map((name, i) => [name, `a${i}`]));
    this.inWarp = proc.warp;
    this.yields = false;
    const body = this.stack(block.next);
    this.params = new Map();
    this.inWarp = false;
    return body;
  }

  /** The yield at the end of a loop iteration, which a warp procedure never needs. */
  private loopYield(): string[] {
    if (this.inWarp) return [];
    this.yields = true;
    return [`  ${LOOP_YIELD}`];
  }

  /** Marks the statement being compiled as one that can yield. */
  private y(line: string): string[] {
    this.yields = true;
    return [line];
  }

  hats(): string[] {
    const out: string[] = [];
    for (const block of Object.values(this.blocks)) {
      if (!block.topLevel) continue;
      let kind: string;
      let arg: string | undefined;
      switch (block.opcode) {
        case "event_whenflagclicked":
          kind = "flag";
          break;
        case "event_whenbroadcastreceived":
          kind = "broadcast";
          arg = (block.fields.BROADCAST_OPTION?.[0] ?? "").toLowerCase();
          break;
        case "event_whenkeypressed":
          kind = "key";
          arg = (block.fields.KEY_OPTION?.[0] ?? "").toLowerCase();
          break;
        case "event_whenthisspriteclicked":
        case "event_whenstageclicked":
          kind = "click";
          break;
        default:
          if (block.opcode.startsWith("event_when") || block.opcode.startsWith("control_start_as_clone")) {
            this.warnings.add(block.opcode);
          }
          continue;
      }
      const body = indent(this.stack(block.next), 2).join("\n");
      const argPart = arg === undefined ? "" : ` arg: ${JSON.stringify(arg)},`;
      out.push(`{ target: ${this.index}, kind: "${kind}",${argPart} fn: function* (t, th) {\n${body}\n} }`);
    }
    return out;
  }

  // ---- statements ----

  private stack(id: string | null | undefined): string[] {
    const lines: string[] = [];
    while (id) {
      const block = this.blocks[id];
      if (!block) break;
      lines.push(...this.statement(block));
      id = block.next;
    }
    return lines;
  }

  private substack(block: Block, name: string): string[] {
    const v = block.inputs[name]?.[1];
    return indent(typeof v === "string" ? this.stack(v) : []);
  }

  private statement(b: Block): string[] {
    const num = (name: string) => this.num(this.input(b, name));
    const any = (name: string) => this.any(this.input(b, name));
    const bool = (name: string) => this.bool(this.input(b, name));
    const field = (name: string) => b.fields[name]?.[0] ?? "";

    switch (b.opcode) {
      // motion
      case "motion_movesteps": return [`rt.move(t, ${num("STEPS")});`];
      case "motion_turnright": return [`rt.setDirection(t, t.direction + ${num("DEGREES")});`];
      case "motion_turnleft": return [`rt.setDirection(t, t.direction - ${num("DEGREES")});`];
      case "motion_gotoxy": return [`rt.setXY(t, ${num("X")}, ${num("Y")});`];
      case "motion_glidesecstoxy": return this.y(`yield* rt.glide(t, ${num("SECS")}, ${num("X")}, ${num("Y")});`);
      case "motion_pointindirection": return [`rt.setDirection(t, ${num("DIRECTION")});`];
      case "motion_changexby": return [`rt.setXY(t, t.x + ${num("DX")}, t.y);`];
      case "motion_setx": return [`rt.setXY(t, ${num("X")}, t.y);`];
      case "motion_changeyby": return [`rt.setXY(t, t.x, t.y + ${num("DY")});`];
      case "motion_sety": return [`rt.setXY(t, t.x, ${num("Y")});`];
      case "motion_ifonedgebounce": return ["rt.bounce(t);"];
      case "motion_setrotationstyle": return [`t.rotationStyle = ${JSON.stringify(field("STYLE"))};`];

      // looks
      case "looks_say": return [`rt.say(t, "say", ${any("MESSAGE")});`];
      case "looks_think": return [`rt.say(t, "think", ${any("MESSAGE")});`];
      case "looks_sayforsecs": return this.y(`yield* rt.sayFor(t, "say", ${any("MESSAGE")}, ${num("SECS")});`);
      case "looks_thinkforsecs": return this.y(`yield* rt.sayFor(t, "think", ${any("MESSAGE")}, ${num("SECS")});`);
      case "looks_switchcostumeto": return [`rt.switchCostume(t, ${any("COSTUME")});`];
      case "looks_nextcostume": return ["rt.nextCostume(t);"];
      case "looks_switchbackdropto": return [`rt.switchCostume(S, ${any("BACKDROP")});`];
      case "looks_nextbackdrop": return ["rt.nextCostume(S);"];
      case "looks_changesizeby": return [`rt.setSize(t, t.size + ${num("CHANGE")});`];
      case "looks_setsizeto": return [`rt.setSize(t, ${num("SIZE")});`];
      case "looks_show": return ["rt.setVisible(t, true);"];
      case "looks_hide": return ["rt.setVisible(t, false);"];
      case "looks_gotofrontback":
        if (field("FRONT_BACK") === "front") return ["rt.goToFront(t);"];
        break;

      // events
      case "event_broadcast": return [`rt.broadcast(${any("BROADCAST_INPUT")});`];
      case "event_broadcastandwait": return this.y(`yield* rt.broadcastAndWait(${any("BROADCAST_INPUT")});`);

      // control
      case "control_wait": return this.y(`yield* rt.wait(${num("DURATION")});`);
      case "control_wait_until": return this.y(`while (!${bool("CONDITION")}) yield rt.WAIT;`);
      case "control_repeat": {
        const r = `r${this.tmp++}`;
        return [`for (let ${r} = Math.round(${num("TIMES")}); ${r} > 0; ${r}--) {`, ...this.substack(b, "SUBSTACK"), ...this.loopYield(), "}"];
      }
      case "control_forever":
        return ["for (;;) {", ...this.substack(b, "SUBSTACK"), ...this.loopYield(), "}"];
      case "control_repeat_until":
        return [`while (!${bool("CONDITION")}) {`, ...this.substack(b, "SUBSTACK"), ...this.loopYield(), "}"];
      case "control_while":
        return [`while (${bool("CONDITION")}) {`, ...this.substack(b, "SUBSTACK"), ...this.loopYield(), "}"];
      case "control_for_each": {
        const r = `r${this.tmp++}`;
        const v = this.variable(b.fields.VARIABLE);
        return [
          `for (let ${r} = 1, n = ${num("VALUE")}; ${r} <= n; ${r}++) {`,
          `  ${v} = ${r};`,
          ...this.substack(b, "SUBSTACK"),
          ...this.loopYield(),
          "}",
        ];
      }
      case "control_if":
        return [`if (${bool("CONDITION")}) {`, ...this.substack(b, "SUBSTACK"), "}"];
      case "control_if_else":
        return [`if (${bool("CONDITION")}) {`, ...this.substack(b, "SUBSTACK"), "} else {", ...this.substack(b, "SUBSTACK2"), "}"];
      case "control_stop": {
        const option = field("STOP_OPTION");
        if (option === "all") return ["throw rt.STOP_ALL;"];
        // In Scratch 3, "stop this script" inside a custom block returns from that block only.
        if (option === "this script") return ["return;"];
        return ["rt.stopOthers(t, th);"];
      }

      // sensing
      case "sensing_askandwait": return this.y(`yield* rt.ask(t, ${any("QUESTION")});`);
      case "sensing_resettimer": return ["rt.resetTimer();"];

      // data
      case "data_setvariableto": return [`${this.variable(b.fields.VARIABLE)} = ${any("VALUE")};`];
      case "data_changevariableby": {
        const v = this.variable(b.fields.VARIABLE);
        return [`${v} = toNum(${v}) + ${num("VALUE")};`];
      }
      case "data_addtolist": return [`${this.list(b.fields.LIST)}.push(${any("ITEM")});`];
      case "data_deleteoflist": return [`deleteOf(${this.list(b.fields.LIST)}, ${any("INDEX")});`];
      case "data_deletealloflist": return [`${this.list(b.fields.LIST)}.length = 0;`];
      case "data_insertatlist": return [`insertAt(${this.list(b.fields.LIST)}, ${any("INDEX")}, ${any("ITEM")});`];
      case "data_replaceitemoflist": return [`replaceAt(${this.list(b.fields.LIST)}, ${any("INDEX")}, ${any("ITEM")});`];
      case "data_showvariable":
      case "data_hidevariable":
      case "data_showlist":
      case "data_hidelist":
        return [];

      // custom blocks
      case "procedures_call": {
        const proc = b.mutation?.proccode ? this.procs.get(b.mutation.proccode) : undefined;
        if (!proc) return [];
        const ids = JSON.parse(b.mutation?.argumentids ?? "[]") as string[];
        const args = ids.map((id) => this.any(this.input(b, id)));
        const call = `${proc.fn}(${["t", "th", ...args].join(", ")});`;
        // A sync procedure never reads th.warp, so it needs no warp bookkeeping.
        if (proc.sync) return [call];
        this.yields = true;
        if (!proc.warp) return [`yield* ${call}`];
        return ["th.warp++;", `try { yield* ${call} } finally { th.warp--; }`];
      }
    }
    this.warnings.add(b.opcode);
    return [`/* unsupported: ${b.opcode} */`];
  }

  // ---- inputs and reporters ----

  private input(b: Block, name: string): Ex {
    const inp: Input | undefined = b.inputs[name];
    if (!inp) return { c: '""', t: "str", k: "" };
    const v: InputValue = inp[1] ?? (inp.length > 2 ? (inp as [3, InputValue, InputValue])[2] : null);
    if (v === null) return { c: '""', t: "str", k: "" };
    if (Array.isArray(v)) return this.primitive(v);
    return this.reporter(v);
  }

  private primitive(p: CompactPrimitive): Ex {
    switch (p[0]) {
      case 12: return { c: this.variable([p[1], p[2]]), t: "any" };
      case 13: return { c: `listContents(${this.list([p[1], p[2]])})`, t: "str" };
      case 11: return lit(p[1]);
      default: return lit(String(p[1]));
    }
  }

  private reporter(id: string): Ex {
    const b = this.blocks[id];
    if (!b) return lit("");
    // Menu shadows (costume names, key names, ...) are a single field holding the value.
    if (b.shadow && Object.keys(b.inputs).length === 0) {
      const f = Object.values(b.fields)[0];
      return lit(f?.[0] ?? "");
    }
    const num = (name: string) => this.num(this.input(b, name));
    const any = (name: string) => this.any(this.input(b, name));
    const str = (name: string) => this.str(this.input(b, name));
    const bool = (name: string) => this.bool(this.input(b, name));
    const field = (name: string) => b.fields[name]?.[0] ?? "";
    const N = (c: string): Ex => ({ c, t: "num" });
    const B = (c: string): Ex => ({ c, t: "bool" });
    const Str = (c: string): Ex => ({ c, t: "str" });

    switch (b.opcode) {
      case "operator_add": return N(`(${num("NUM1")} + ${num("NUM2")})`);
      case "operator_subtract": return N(`(${num("NUM1")} - ${num("NUM2")})`);
      case "operator_multiply": return N(`(${num("NUM1")} * ${num("NUM2")})`);
      case "operator_divide": return N(`(${num("NUM1")} / ${num("NUM2")})`);
      case "operator_mod": return N(`mod(${num("NUM1")}, ${num("NUM2")})`);
      case "operator_random": return N(`random(${any("FROM")}, ${any("TO")})`);
      case "operator_lt": return this.comparison(b, "<", "lt");
      case "operator_gt": return this.comparison(b, ">", "gt");
      case "operator_equals": return this.comparison(b, "===", "eq");
      case "operator_and": return B(`(${bool("OPERAND1")} && ${bool("OPERAND2")})`);
      case "operator_or": return B(`(${bool("OPERAND1")} || ${bool("OPERAND2")})`);
      case "operator_not": return B(`!${bool("OPERAND")}`);
      case "operator_join": return Str(`(${str("STRING1")} + ${str("STRING2")})`);
      case "operator_letter_of": return Str(`letterOf(${any("LETTER")}, ${any("STRING")})`);
      case "operator_length": return N(`${str("STRING")}.length`);
      case "operator_contains": return B(`contains(${any("STRING1")}, ${any("STRING2")})`);
      case "operator_round": return N(`Math.round(${num("NUM")})`);
      case "operator_mathop": return N(`mathop(${JSON.stringify(field("OPERATOR").toLowerCase())}, ${num("NUM")})`);

      case "motion_xposition": return N("rt.coord(t.x)");
      case "motion_yposition": return N("rt.coord(t.y)");
      case "motion_direction": return N("t.direction");
      case "looks_costumenumbername":
        return field("NUMBER_NAME") === "name" ? Str("rt.costumeName(t)") : N("(t.costume + 1)");
      case "looks_backdropnumbername":
        return field("NUMBER_NAME") === "name" ? Str("rt.costumeName(S)") : N("(S.costume + 1)");
      case "looks_size": return N("Math.round(t.size)");

      case "sensing_timer": return N("rt.timer()");
      case "sensing_answer": return Str("rt.answer");
      case "sensing_mousex": return N("rt.mouse.x");
      case "sensing_mousey": return N("rt.mouse.y");
      case "sensing_mousedown": return B("rt.mouse.down");
      case "sensing_keypressed": return B(`rt.keyPressed(${any("KEY_OPTION")})`);
      case "sensing_dayssince2000": return N("rt.daysSince2000()");
      case "sensing_username": return lit("");

      case "data_variable": return { c: this.variable(b.fields.VARIABLE), t: "any" };
      case "data_listcontents": return Str(`listContents(${this.list(b.fields.LIST)})`);
      case "data_itemoflist": return { c: `itemOf(${this.list(b.fields.LIST)}, ${any("INDEX")})`, t: "any" };
      case "data_lengthoflist": return N(`${this.list(b.fields.LIST)}.length`);
      case "data_listcontainsitem": return B(`listContains(${this.list(b.fields.LIST)}, ${any("ITEM")})`);
      case "data_itemnumoflist": return N(`indexOf(${this.list(b.fields.LIST)}, ${any("ITEM")})`);

      case "argument_reporter_string_number": {
        const p = this.params.get(field("VALUE"));
        return p ? { c: p, t: "any" } : lit("0");
      }
      case "argument_reporter_boolean": {
        const p = this.params.get(field("VALUE"));
        return p ? { c: p, t: "any" } : { c: "false", t: "bool" };
      }
    }
    this.warnings.add(b.opcode);
    return lit("");
  }

  private comparison(b: Block, jsOp: string, helper: string): Ex {
    const a = this.input(b, "OPERAND1");
    const c = this.input(b, "OPERAND2");
    // Two numbers compare with plain JS operators; anything else needs Scratch's mixed rules.
    if (isNumeric(a) && isNumeric(c)) return { c: `(${this.num(a)} ${jsOp} ${this.num(c)})`, t: "bool" };
    // A literal that is not a number makes the comparison case-insensitive text, whatever the
    // other side holds.
    if (isTextLiteral(a) || isTextLiteral(c)) {
      const lower = (e: Ex) => (e.k !== undefined ? JSON.stringify(e.k.toLowerCase()) : `${this.str(e)}.toLowerCase()`);
      return { c: `(${lower(a)} ${jsOp} ${lower(c)})`, t: "bool" };
    }
    // A numeric literal can be passed as a number when it prints back the same, which saves the
    // helper from parsing it on every call.
    const arg = (e: Ex) => (e.k !== undefined && String(Number(e.k)) === e.k ? numLiteral(Number(e.k)) : this.any(e));
    return { c: `${helper}(${arg(a)}, ${arg(c)})`, t: "bool" };
  }

  // ---- casts ----

  private num(e: Ex): string {
    if (e.k !== undefined) return numLiteral(toNumber(e.k));
    if (e.t === "num") return e.c;
    if (e.t === "bool") return `(+${e.c})`;
    return `toNum(${e.c})`;
  }

  private str(e: Ex): string {
    if (e.k !== undefined) return JSON.stringify(e.k);
    if (e.t === "str") return e.c;
    if (e.t === "num") return `("" + ${e.c})`;
    if (e.t === "bool") return `(${e.c} ? "true" : "false")`;
    return `toStr(${e.c})`;
  }

  private bool(e: Ex): string {
    if (e.k !== undefined) return String(e.k !== "" && e.k !== "0" && e.k.toLowerCase() !== "false");
    if (e.t === "bool") return e.c;
    return `toBool(${e.c})`;
  }

  private any(e: Ex): string {
    if (e.k !== undefined) return JSON.stringify(e.k);
    return e.c;
  }

  // ---- variables ----

  private variable(field: [string, string | null] | [string] | undefined): string {
    return this.lookup(field, "variables", "v");
  }

  private list(field: [string, string | null] | [string] | undefined): string {
    return this.lookup(field, "lists", "l");
  }

  private lookup(field: [string, string | null] | [string] | undefined, kind: "variables" | "lists", prop: "v" | "l"): string {
    const [name, id] = [field?.[0] ?? "", field?.[1] ?? null];
    const ref = (owner: string, key: string) => `${owner}.${prop}[${JSON.stringify(key)}]`;
    if (id && id in this.target[kind]) return ref("t", id);
    if (id && id in this.stage[kind]) return ref("S", id);
    // Fall back to a lookup by name, as scratch-vm does for projects with stale ids.
    for (const [owner, t] of [["t", this.target], ["S", this.stage]] as const) {
      const found = Object.entries(t[kind]).find(([, v]) => v[0] === name);
      if (found) return ref(owner, found[0]);
    }
    // Unknown: create it on the stage when the program starts.
    const key = id ?? `missing:${name}`;
    const init = kind === "lists" ? "[]" : "0";
    const line = `if (!(${JSON.stringify(key)} in S.${prop})) S.${prop}[${JSON.stringify(key)}] = ${init};`;
    if (!this.prelude.includes(line)) this.prelude.push(line);
    return ref("S", key);
  }
}

function lit(value: string): Ex {
  return { c: JSON.stringify(value), t: "str", k: value };
}

function toNumber(s: string): number {
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function numLiteral(n: number): string {
  if (Object.is(n, -0)) return "-0";
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  return n < 0 ? `(${n})` : String(n);
}

/** True when an expression is certainly a number: a numeric literal or an arithmetic result. */
function isNumeric(e: Ex): boolean {
  if (e.k !== undefined) return e.k.trim() !== "" && !Number.isNaN(Number(e.k));
  return e.t === "num";
}

/** True for a literal that Scratch compares as text: not a number, or only whitespace. */
function isTextLiteral(e: Ex): boolean {
  return e.k !== undefined && (e.k.trim() === "" || Number.isNaN(Number(e.k)));
}

function indent(lines: string[], levels = 1): string[] {
  const pad = "  ".repeat(levels);
  return lines.map((l) => pad + l);
}

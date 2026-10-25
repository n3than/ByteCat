import {
  IdGen, defaultBackdrop, isBuiltinShape, shapeCostume, svgCostume,
  type Asset, type Block, type CompactPrimitive, type Input, type Mutation, type Project,
  type ProjectJson, type ScalarValue, type SpriteTarget, type StageTarget, type Target,
} from "@bytecat/sb3";
import type { Declaration, Expr, Literal, ProgramNode, ScriptNode, Stmt, TargetNode } from "./ast.js";
import { REPORTERS, STATEMENTS, defaultShadow, type Builtin, type Slot } from "./builtins.js";
import { PseudoError, type SourcePos } from "./errors.js";

export interface LowerResult {
  project: Project;
  /** Maps every non-shadow block id to the pseudocode line it came from. */
  sourceMap: Record<string, { target: string; line: number }>;
}

/** The name of the stage list that `log(x)` appends to. */
export const LOG_LIST = "log";

const SPRITE_COLORS = ["#ffab19", "#4c97ff", "#59c059", "#ff6680", "#9966ff", "#0fbd8c"];

interface Symbol {
  id: string;
  name: string;
}

interface Procedure {
  name: string;
  proccode: string;
  argumentIds: string[];
  params: { name: string; boolean: boolean }[];
  warp: boolean;
}

/** The result of lowering an expression: an inline primitive or a reporter block. */
type Value =
  | { kind: "prim"; prim: CompactPrimitive; bool: false }
  | { kind: "block"; id: string; bool: boolean };

/** Project-wide state: the stage's variables, lists and broadcasts, shared by every sprite. */
class ProjectScope {
  readonly ids = new IdGen();
  readonly globals = new Map<string, Symbol>();
  readonly globalLists = new Map<string, Symbol>();
  readonly broadcasts = new Map<string, Symbol>();
  readonly stageVars: StageTarget["variables"] = {};
  readonly stageLists: StageTarget["lists"] = {};
  readonly sourceMap: LowerResult["sourceMap"] = {};

  constructor(readonly file: string | undefined) {}

  error(message: string, pos: SourcePos): PseudoError {
    return new PseudoError(message, pos, this.file);
  }

  broadcast(name: string): Symbol {
    let b = this.broadcasts.get(name);
    if (!b) {
      b = { id: this.ids.id("msg"), name };
      this.broadcasts.set(name, b);
    }
    return b;
  }

  logList(): Symbol {
    let list = this.globalLists.get(LOG_LIST);
    if (!list) {
      list = { id: this.ids.id("list"), name: LOG_LIST };
      this.globalLists.set(LOG_LIST, list);
      this.stageLists[list.id] = [LOG_LIST, []];
    }
    return list;
  }
}

export function lower(program: ProgramNode, file?: string): LowerResult {
  const scope = new ProjectScope(file);
  for (const decl of program.globals) declare(scope, decl, scope.globals, scope.globalLists, scope.stageVars, scope.stageLists);

  const stages = program.targets.filter((t) => t.kind === "stage");
  if (stages.length > 1) throw scope.error("only one 'stage' section is allowed", stages[1]!.pos);
  const stageNode: TargetNode = stages[0] ?? { kind: "stage", name: "Stage", pos: { line: 1, col: 1 }, declarations: [], properties: [], scripts: [] };
  const spriteNodes = program.targets.filter((t) => t.kind === "sprite");

  const seen = new Set<string>();
  for (const s of spriteNodes) {
    if (s.name === "Stage" || seen.has(s.name)) throw scope.error(`duplicate sprite name '${s.name}'`, s.pos);
    seen.add(s.name);
  }

  const assets = new Map<string, Uint8Array>();
  // The stage's own declarations are globals too, so declare them before any sprite resolves names.
  const stageBuilder = new TargetBuilder(scope, stageNode, true, 0, assets);
  const sprites = spriteNodes.map((node, i) => new TargetBuilder(scope, node, false, i + 1, assets));
  const targets = [stageBuilder, ...sprites].map((b) => b.build());

  const json: ProjectJson = {
    targets: targets as ProjectJson["targets"],
    monitors: [],
    extensions: [],
    meta: { semver: "3.0.0", vm: "0.2.0", agent: "bytecat-pseudo" },
  };
  const stage = json.targets[0];
  stage.variables = scope.stageVars;
  stage.lists = scope.stageLists;
  stage.broadcasts = Object.fromEntries([...scope.broadcasts.values()].map((b) => [b.id, b.name]));

  return { project: { json, assets }, sourceMap: scope.sourceMap };
}

function literalValue(lit: Literal): ScalarValue {
  return lit.kind === "number" ? Number(lit.value) : lit.value;
}

function declare(
  scope: ProjectScope,
  decl: Declaration,
  vars: Map<string, Symbol>,
  lists: Map<string, Symbol>,
  varOut: Target["variables"],
  listOut: Target["lists"],
): void {
  if (decl.kind === "costume") return;
  const taken = (name: string) =>
    vars.has(name) || lists.has(name) || scope.globals.has(name) || scope.globalLists.has(name);
  if (taken(decl.name)) throw scope.error(`'${decl.name}' is already declared`, decl.pos);
  if (decl.kind === "var") {
    const sym = { id: scope.ids.id("var"), name: decl.name };
    vars.set(decl.name, sym);
    varOut[sym.id] = [decl.name, literalValue(decl.value)];
  } else {
    const sym = { id: scope.ids.id("list"), name: decl.name };
    lists.set(decl.name, sym);
    listOut[sym.id] = [decl.name, decl.items.map(literalValue)];
  }
}

class TargetBuilder {
  private readonly blocks: Record<string, Block> = {};
  private readonly vars = new Map<string, Symbol>();
  private readonly lists = new Map<string, Symbol>();
  private readonly varOut: Target["variables"] = {};
  private readonly listOut: Target["lists"] = {};
  private readonly procedures = new Map<string, Procedure>();
  private readonly costumes: Asset[] = [];
  private params: Procedure["params"] | null = null;
  private scriptY = 0;

  constructor(
    private readonly scope: ProjectScope,
    private readonly node: TargetNode,
    private readonly isStage: boolean,
    private readonly layer: number,
    private readonly assets: Map<string, Uint8Array>,
  ) {
    for (const decl of node.declarations) {
      if (decl.kind === "costume") this.addCostume(decl);
      else if (isStage) declare(scope, decl, scope.globals, scope.globalLists, scope.stageVars, scope.stageLists);
      else declare(scope, decl, this.vars, this.lists, this.varOut, this.listOut);
    }
  }

  private addCostume(decl: Extract<Declaration, { kind: "costume" }>): void {
    if (this.costumes.some((c) => c.costume.name === decl.name)) {
      throw this.scope.error(`duplicate costume '${decl.name}'`, decl.pos);
    }
    let asset: Asset;
    if (decl.shape === "backdrop") {
      const fill = decl.color ?? "#ffffff";
      asset = svgCostume(
        decl.name,
        `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="${fill}"/></svg>`,
        240,
        180,
      );
    } else if (isBuiltinShape(decl.shape)) {
      asset = shapeCostume(decl.name, decl.shape, decl.color ?? SPRITE_COLORS[(this.layer - 1) % SPRITE_COLORS.length]);
    } else {
      throw this.scope.error(`unknown costume shape '${decl.shape}', expected circle, square or triangle`, decl.pos);
    }
    this.costumes.push(asset);
  }

  build(): Target {
    if (this.costumes.length === 0) {
      this.costumes.push(
        this.isStage ? defaultBackdrop() : shapeCostume("costume1", "circle", SPRITE_COLORS[(this.layer - 1) % SPRITE_COLORS.length]),
      );
    }
    for (const a of this.costumes) this.assets.set(a.costume.md5ext, a.data);

    // Register every procedure first so calls can come before definitions.
    for (const script of this.node.scripts) if (script.kind === "define") this.registerProcedure(script);
    for (const script of this.node.scripts) this.script(script);

    const base = {
      name: this.node.name,
      variables: this.varOut,
      lists: this.listOut,
      broadcasts: {},
      blocks: this.blocks,
      comments: {},
      currentCostume: 0,
      costumes: this.costumes.map((a) => a.costume),
      sounds: [],
      volume: 100,
      layerOrder: this.layer,
    };
    if (this.isStage) {
      return { ...base, isStage: true, tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null };
    }
    const sprite: SpriteTarget = {
      ...base,
      isStage: false,
      visible: true,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: "all around",
    };
    for (const p of this.node.properties) {
      if (p.kind === "position") {
        sprite.x = p.x;
        sprite.y = p.y;
      } else if (p.kind === "size") sprite.size = p.value;
      else if (p.kind === "direction") sprite.direction = p.value;
      else sprite.visible = false;
    }
    return sprite;
  }

  // ---- block helpers ----

  private error(message: string, pos: SourcePos): PseudoError {
    return this.scope.error(message, pos);
  }

  private block(opcode: string, parent: string | null, pos: SourcePos | null, extra: Partial<Block> = {}): string {
    const id = this.scope.ids.id();
    this.blocks[id] = { opcode, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel: false, ...extra };
    if (pos && !this.blocks[id]!.shadow) this.scope.sourceMap[id] = { target: this.node.name, line: pos.line };
    return id;
  }

  private get(id: string): Block {
    return this.blocks[id]!;
  }

  private variable(name: string, pos: SourcePos): Symbol {
    const v = this.vars.get(name) ?? this.scope.globals.get(name);
    if (v) return v;
    if (this.lists.has(name) || this.scope.globalLists.has(name)) {
      throw this.error(`'${name}' is a list, not a variable`, pos);
    }
    throw this.error(`unknown variable '${name}'. Declare it first with 'var ${name} = 0'`, pos);
  }

  private list(name: string, pos: SourcePos): Symbol {
    const l = this.lists.get(name) ?? this.scope.globalLists.get(name);
    if (l) return l;
    if (this.vars.has(name) || this.scope.globals.has(name)) {
      throw this.error(`'${name}' is a variable, not a list`, pos);
    }
    throw this.error(`unknown list '${name}'. Declare it first with 'list ${name}'`, pos);
  }

  // ---- scripts ----

  private registerProcedure(def: Extract<ScriptNode, { kind: "define" }>): void {
    if (this.procedures.has(def.name)) throw this.error(`procedure '${def.name}' is already defined`, def.pos);
    if (STATEMENTS[def.name] || REPORTERS[def.name] || def.name === "log") {
      throw this.error(`'${def.name}' is a builtin and cannot be redefined`, def.pos);
    }
    this.procedures.set(def.name, {
      name: def.name,
      proccode: [def.name, ...def.params.map((p) => (p.boolean ? "%b" : "%s"))].join(" "),
      argumentIds: def.params.map(() => this.scope.ids.id("arg")),
      params: def.params,
      warp: def.warp,
    });
  }

  private script(script: ScriptNode): void {
    const pos = { x: 0, y: this.scriptY };
    let hat: string;
    if (script.kind === "when") {
      const h = script.hat;
      if (h.kind === "flag") hat = this.block("event_whenflagclicked", null, script.pos);
      else if (h.kind === "clicked") hat = this.block(this.isStage ? "event_whenstageclicked" : "event_whenthisspriteclicked", null, script.pos);
      else if (h.kind === "key") {
        hat = this.block("event_whenkeypressed", null, script.pos);
        this.get(hat).fields.KEY_OPTION = [h.key, null];
      } else {
        const b = this.scope.broadcast(h.message);
        hat = this.block("event_whenbroadcastreceived", null, script.pos);
        this.get(hat).fields.BROADCAST_OPTION = [b.name, b.id];
      }
    } else {
      const proc = this.procedures.get(script.name)!;
      hat = this.block("procedures_definition", null, script.pos);
      const proto = this.block("procedures_prototype", hat, null, { shadow: true });
      this.get(hat).inputs.custom_block = [1, proto];
      proc.params.forEach((p, i) => {
        const arg = this.block(p.boolean ? "argument_reporter_boolean" : "argument_reporter_string_number", proto, null, { shadow: true });
        this.get(arg).fields.VALUE = [p.name, null];
        this.get(proto).inputs[proc.argumentIds[i]!] = [1, arg];
      });
      this.get(proto).mutation = {
        tagName: "mutation",
        children: [],
        proccode: proc.proccode,
        argumentids: JSON.stringify(proc.argumentIds),
        argumentnames: JSON.stringify(proc.params.map((p) => p.name)),
        argumentdefaults: JSON.stringify(proc.params.map((p) => (p.boolean ? "false" : ""))),
        warp: String(proc.warp),
      };
      this.params = proc.params;
    }
    Object.assign(this.get(hat), { topLevel: true, ...pos });
    const before = Object.keys(this.blocks).length;
    const first = this.statements(script.body, hat);
    this.get(hat).next = first;
    this.params = null;
    // Leave room below each script so they do not overlap when opened in the editor.
    this.scriptY += 80 + (Object.keys(this.blocks).length - before) * 24;
  }

  /** Lowers a statement list and chains it under `parent`. Returns the first block id. */
  private statements(stmts: Stmt[], parent: string): string | null {
    let first: string | null = null;
    let prev: string | null = null;
    for (const stmt of stmts) {
      const [head, tail] = this.statement(stmt, prev ?? parent);
      if (prev) this.get(prev).next = head;
      else first = head;
      prev = tail;
    }
    return first;
  }

  /** Lowers one statement, which may expand into several chained blocks. Returns [first, last]. */
  private statement(stmt: Stmt, parent: string): [string, string] {
    switch (stmt.kind) {
      case "assign":
        return this.assign(stmt, parent);
      case "setItem": {
        const id = this.block("data_replaceitemoflist", parent, stmt.pos);
        this.listField(id, stmt.list, stmt.pos);
        this.valueInput(id, "INDEX", 7, "1", stmt.index);
        this.valueInput(id, "ITEM", 10, "thing", stmt.value);
        return [id, id];
      }
      case "method":
        return this.listMethod(stmt, parent);
      case "call":
        return this.callStatement(stmt, parent);
      case "if": {
        const id = this.block(stmt.else ? "control_if_else" : "control_if", parent, stmt.pos);
        this.boolInput(id, "CONDITION", stmt.cond);
        this.substack(id, "SUBSTACK", stmt.then);
        if (stmt.else) this.substack(id, "SUBSTACK2", stmt.else);
        return [id, id];
      }
      case "repeat": {
        const id = this.block("control_repeat", parent, stmt.pos);
        this.valueInput(id, "TIMES", 6, "10", stmt.count);
        this.substack(id, "SUBSTACK", stmt.body);
        return [id, id];
      }
      case "forever": {
        const id = this.block("control_forever", parent, stmt.pos);
        this.substack(id, "SUBSTACK", stmt.body);
        return [id, id];
      }
      case "until":
      case "while": {
        const id = this.block("control_repeat_until", parent, stmt.pos);
        const cond: Expr = stmt.kind === "while" ? { kind: "unary", op: "not", operand: stmt.cond, pos: stmt.pos } : stmt.cond;
        this.boolInput(id, "CONDITION", cond);
        this.substack(id, "SUBSTACK", stmt.body);
        return [id, id];
      }
      case "for": {
        // for i = a to b:  =>  i = a; repeat until i > b: body; i += 1
        const v: Expr = { kind: "name", name: stmt.variable, pos: stmt.pos };
        const [init] = this.assign({ kind: "assign", target: stmt.variable, op: "=", value: stmt.from, pos: stmt.pos }, parent);
        const loop = this.block("control_repeat_until", init, stmt.pos);
        this.get(init).next = loop;
        this.boolInput(loop, "CONDITION", { kind: "binary", op: ">", left: v, right: stmt.to, pos: stmt.pos });
        const step: Stmt = { kind: "assign", target: stmt.variable, op: "+=", value: { kind: "number", value: "1", pos: stmt.pos }, pos: stmt.pos };
        this.substack(loop, "SUBSTACK", [...stmt.body, step]);
        return [init, loop];
      }
    }
  }

  private substack(id: string, input: string, body: Stmt[]): void {
    const first = this.statements(body, id);
    if (first) this.get(id).inputs[input] = [2, first];
  }

  private assign(stmt: Extract<Stmt, { kind: "assign" }>, parent: string): [string, string] {
    const v = this.variable(stmt.target, stmt.pos);
    let opcode = "data_setvariableto";
    let value = stmt.value;
    if (stmt.op === "+=") opcode = "data_changevariableby";
    else if (stmt.op === "-=") {
      opcode = "data_changevariableby";
      value = value.kind === "number"
        ? { ...value, value: value.value.startsWith("-") ? value.value.slice(1) : "-" + value.value }
        : { kind: "unary", op: "-", operand: value, pos: value.pos };
    } else if (stmt.op === "*=" || stmt.op === "/=") {
      value = { kind: "binary", op: stmt.op[0] as "*" | "/", left: { kind: "name", name: stmt.target, pos: stmt.pos }, right: value, pos: stmt.pos };
    }
    const id = this.block(opcode, parent, stmt.pos);
    this.get(id).fields.VARIABLE = [v.name, v.id];
    if (opcode === "data_setvariableto") this.valueInput(id, "VALUE", 10, "0", value);
    else this.valueInput(id, "VALUE", 4, "1", value);
    return [id, id];
  }

  private listMethod(stmt: Extract<Stmt, { kind: "method" }>, parent: string): [string, string] {
    const spec: Record<string, { opcode: string; args: [string, 7 | 10, string][] }> = {
      add: { opcode: "data_addtolist", args: [["ITEM", 10, "thing"]] },
      insert: { opcode: "data_insertatlist", args: [["INDEX", 7, "1"], ["ITEM", 10, "thing"]] },
      delete: { opcode: "data_deleteoflist", args: [["INDEX", 7, "1"]] },
      clear: { opcode: "data_deletealloflist", args: [] },
    };
    const m = spec[stmt.method];
    if (!m) throw this.error(`unknown list method '${stmt.method}', expected add, insert, delete or clear`, stmt.pos);
    if (stmt.args.length !== m.args.length) {
      throw this.error(`${stmt.object}.${stmt.method}() takes ${m.args.length} argument(s), got ${stmt.args.length}`, stmt.pos);
    }
    const id = this.block(m.opcode, parent, stmt.pos);
    this.listField(id, stmt.object, stmt.pos);
    m.args.forEach(([input, prim, def], i) => this.valueInput(id, input, prim, def, stmt.args[i]!));
    return [id, id];
  }

  private listField(id: string, name: string, pos: SourcePos): void {
    const l = this.list(name, pos);
    this.get(id).fields.LIST = [l.name, l.id];
  }

  private callStatement(stmt: Extract<Stmt, { kind: "call" }>, parent: string): [string, string] {
    if (stmt.callee === "log") {
      if (stmt.args.length !== 1) throw this.error(`log() takes 1 argument, got ${stmt.args.length}`, stmt.pos);
      const id = this.block("data_addtolist", parent, stmt.pos);
      const l = this.scope.logList();
      this.get(id).fields.LIST = [l.name, l.id];
      this.valueInput(id, "ITEM", 10, "", stmt.args[0]!);
      return [id, id];
    }
    const proc = this.procedures.get(stmt.callee);
    if (proc) {
      if (stmt.args.length !== proc.params.length) {
        throw this.error(`${proc.name}() takes ${proc.params.length} argument(s), got ${stmt.args.length}`, stmt.pos);
      }
      const id = this.block("procedures_call", parent, stmt.pos);
      this.get(id).mutation = {
        tagName: "mutation",
        children: [],
        proccode: proc.proccode,
        argumentids: JSON.stringify(proc.argumentIds),
        warp: String(proc.warp),
      };
      proc.params.forEach((p, i) => {
        if (p.boolean) this.boolInput(id, proc.argumentIds[i]!, stmt.args[i]!);
        else this.valueInput(id, proc.argumentIds[i]!, 10, "", stmt.args[i]!);
      });
      return [id, id];
    }
    if (REPORTERS[stmt.callee]) {
      throw this.error(`${stmt.callee}() is a reporter and cannot be used as a statement`, stmt.pos);
    }
    const builtin = this.pickOverload(STATEMENTS, stmt.callee, stmt.args.length, stmt.pos, "function");
    const id = this.block(builtin.opcode, parent, stmt.pos);
    this.applyBuiltin(id, builtin, stmt.args, stmt.pos);
    if (builtin.opcode === "control_stop") {
      const option = this.get(id).fields.STOP_OPTION![0];
      this.get(id).mutation = { tagName: "mutation", children: [], hasnext: String(option === "other scripts in sprite") };
    }
    return [id, id];
  }

  private pickOverload(table: Record<string, Builtin[]>, name: string, arity: number, pos: SourcePos, what: string): Builtin {
    const overloads = table[name];
    if (!overloads) {
      const hint = suggest(name, [...Object.keys(table), ...(what === "function" ? [...this.procedures.keys(), "log"] : [])]);
      throw this.error(`unknown ${what} '${name}'${hint ? `. Did you mean '${hint}'?` : ""}`, pos);
    }
    const b = overloads.find((o) => o.slots.length === arity);
    if (!b) {
      const counts = overloads.map((o) => o.slots.length).join(" or ");
      throw this.error(`${name}() takes ${counts} argument(s), got ${arity}`, pos);
    }
    if (b.spriteOnly && this.isStage) throw this.error(`${name}() is only available in sprites, not the stage`, pos);
    return b;
  }

  private applyBuiltin(id: string, builtin: Builtin, args: Expr[], pos: SourcePos): void {
    for (const [field, value] of Object.entries(builtin.fixed ?? {})) this.get(id).fields[field] = [value, null];
    builtin.slots.forEach((slot, i) => this.slot(id, slot, args[i]!, pos));
  }

  private slot(id: string, slot: Slot, arg: Expr, pos: SourcePos): void {
    switch (slot.kind) {
      case "value":
        this.valueInput(id, slot.input, slot.prim, slot.default ?? "", arg);
        return;
      case "bool":
        this.boolInput(id, slot.input, arg);
        return;
      case "field": {
        if (arg.kind !== "string" || !slot.values.includes(arg.value)) {
          throw this.error(`expected one of ${slot.values.map((v) => `"${v}"`).join(", ")}`, arg.pos ?? pos);
        }
        this.get(id).fields[slot.field] = [arg.value, null];
        return;
      }
      case "menu": {
        const literal = arg.kind === "string" || arg.kind === "number" ? arg.value : null;
        if (literal !== null && slot.shadow === "looks_costume" && !this.costumes.some((c) => c.costume.name === literal)) {
          throw this.error(`unknown costume "${literal}"`, arg.pos);
        }
        const menu = this.block(slot.shadow, id, null, { shadow: true });
        this.get(menu).fields[slot.field] = [literal ?? slot.default, null];
        if (literal !== null) this.get(id).inputs[slot.input] = [1, menu];
        else this.get(id).inputs[slot.input] = [3, this.reporterBlock(arg, id), menu];
        return;
      }
      case "broadcast": {
        if (arg.kind === "string") {
          const b = this.scope.broadcast(arg.value);
          this.get(id).inputs[slot.input] = [1, [11, b.name, b.id]];
        } else {
          const fallback = this.scope.broadcast("message1");
          this.get(id).inputs[slot.input] = [3, this.reporterBlock(arg, id), [11, fallback.name, fallback.id]];
        }
        return;
      }
    }
  }

  // ---- expressions ----

  private valueInput(id: string, input: string, prim: 4 | 5 | 6 | 7 | 8 | 10, def: string, expr: Expr): void {
    const v = this.value(expr, id);
    const shadow = defaultShadow({ kind: "value", input, prim, default: def });
    const inp: Input = v.kind === "prim"
      ? v.prim[0] >= 11 ? [3, v.prim, shadow] : [1, retag(v.prim, prim)]
      : [3, v.id, shadow];
    this.get(id).inputs[input] = inp;
  }

  private boolInput(id: string, input: string, expr: Expr): void {
    const b = this.bool(expr, id);
    if (b) this.get(id).inputs[input] = [2, b];
  }

  /** Lowers an expression for a boolean slot. Returns null for `false` (an empty slot). */
  private bool(expr: Expr, parent: string): string | null {
    if (expr.kind === "bool") {
      if (!expr.value) return null;
      // An empty `not` reports true.
      return this.block("operator_not", parent, expr.pos);
    }
    const v = this.value(expr, parent);
    if (v.kind === "block" && v.bool) return v.id;
    throw this.error(
      "expected a condition (a comparison, and/or/not, or a boolean reporter like key_pressed()). " +
        "Compare values explicitly, for example 'x = 1'",
      expr.pos,
    );
  }

  /** Lowers an expression that must become a block (for menu and broadcast slots). */
  private reporterBlock(expr: Expr, parent: string): string {
    const v = this.value(expr, parent);
    if (v.kind === "block") return v.id;
    if (v.prim[0] === 12 || v.prim[0] === 13) {
      const opcode = v.prim[0] === 12 ? "data_variable" : "data_listcontents";
      const id = this.block(opcode, parent, expr.pos);
      this.get(id).fields[v.prim[0] === 12 ? "VARIABLE" : "LIST"] = [v.prim[1], v.prim[2]];
      return id;
    }
    // A plain literal: wrap it in a join so it can sit in a reporter-only slot.
    const id = this.block("operator_join", parent, expr.pos);
    this.get(id).inputs.STRING1 = [1, [10, String(v.prim[1])]];
    this.get(id).inputs.STRING2 = [1, [10, ""]];
    return id;
  }

  private value(expr: Expr, parent: string): Value {
    switch (expr.kind) {
      case "number":
        return { kind: "prim", prim: [4, expr.value], bool: false };
      case "string":
        return { kind: "prim", prim: [10, expr.value], bool: false };
      case "bool": {
        if (!expr.value) return { kind: "prim", prim: [10, "false"], bool: false };
        return { kind: "prim", prim: [10, "true"], bool: false };
      }
      case "name": {
        const param = this.params?.find((p) => p.name === expr.name);
        if (param) {
          const id = this.block(param.boolean ? "argument_reporter_boolean" : "argument_reporter_string_number", parent, expr.pos);
          this.get(id).fields.VALUE = [param.name, null];
          return { kind: "block", id, bool: param.boolean };
        }
        const v = this.vars.get(expr.name) ?? this.scope.globals.get(expr.name);
        if (v) return { kind: "prim", prim: [12, v.name, v.id], bool: false };
        const l = this.lists.get(expr.name) ?? this.scope.globalLists.get(expr.name);
        if (l) return { kind: "prim", prim: [13, l.name, l.id], bool: false };
        if (REPORTERS[expr.name]) throw this.error(`'${expr.name}' is a reporter, call it with parentheses: ${expr.name}()`, expr.pos);
        throw this.error(`unknown name '${expr.name}'. Declare it with 'var ${expr.name} = 0' or 'list ${expr.name}'`, expr.pos);
      }
      case "index": {
        const id = this.block("data_itemoflist", parent, expr.pos);
        this.listField(id, expr.list, expr.pos);
        this.valueInput(id, "INDEX", 7, "1", expr.index);
        return { kind: "block", id, bool: false };
      }
      case "member":
        return this.listMember(expr, parent);
      case "call": {
        if (this.procedures.has(expr.callee)) {
          throw this.error(`${expr.callee}() is a procedure and returns nothing. Store results in a variable instead`, expr.pos);
        }
        if (expr.callee === "join") return this.join(expr.args, parent, expr.pos);
        if (STATEMENTS[expr.callee] || expr.callee === "log") {
          throw this.error(`${expr.callee}() is a statement and cannot be used as a value`, expr.pos);
        }
        const builtin = this.pickOverload(REPORTERS, expr.callee, expr.args.length, expr.pos, "reporter");
        const id = this.block(builtin.opcode, parent, expr.pos);
        this.applyBuiltin(id, builtin, expr.args, expr.pos);
        return { kind: "block", id, bool: builtin.returns === "bool" };
      }
      case "unary": {
        if (expr.op === "not") {
          const id = this.block("operator_not", parent, expr.pos);
          this.boolInput(id, "OPERAND", expr.operand);
          return { kind: "block", id, bool: true };
        }
        return this.binary({ kind: "binary", op: "-", left: { kind: "number", value: "0", pos: expr.pos }, right: expr.operand, pos: expr.pos }, parent);
      }
      case "binary":
        return this.binary(expr, parent);
    }
  }

  private listMember(expr: Extract<Expr, { kind: "member" }>, parent: string): Value {
    const spec: Record<string, { opcode: string; args: number; bool: boolean; call: boolean }> = {
      length: { opcode: "data_lengthoflist", args: 0, bool: false, call: false },
      contains: { opcode: "data_listcontainsitem", args: 1, bool: true, call: true },
      index_of: { opcode: "data_itemnumoflist", args: 1, bool: false, call: true },
    };
    const m = spec[expr.member];
    if (!m) throw this.error(`unknown list property '${expr.member}', expected length, contains() or index_of()`, expr.pos);
    if (m.call !== (expr.args !== null)) {
      throw this.error(m.call ? `${expr.member} is a method, call it: ${expr.object}.${expr.member}(x)` : `${expr.member} is a property, write ${expr.object}.${expr.member} without parentheses`, expr.pos);
    }
    if ((expr.args?.length ?? 0) !== m.args) throw this.error(`${expr.object}.${expr.member}() takes ${m.args} argument(s)`, expr.pos);
    const id = this.block(m.opcode, parent, expr.pos);
    this.listField(id, expr.object, expr.pos);
    if (m.args === 1) this.valueInput(id, "ITEM", 10, "thing", expr.args![0]!);
    return { kind: "block", id, bool: m.bool };
  }

  private join(args: Expr[], parent: string, pos: SourcePos): Value {
    if (args.length < 2) throw this.error("join() takes at least 2 arguments", pos);
    // join(a, b, c) => join(a, join(b, c))
    const id = this.block("operator_join", parent, pos);
    this.valueInput(id, "STRING1", 10, "apple ", args[0]!);
    if (args.length === 2) this.valueInput(id, "STRING2", 10, "banana", args[1]!);
    else this.get(id).inputs.STRING2 = [3, (this.join(args.slice(1), id, pos) as { id: string }).id, [10, "banana"]];
    return { kind: "block", id, bool: false };
  }

  private binary(expr: Extract<Expr, { kind: "binary" }>, parent: string): Value {
    const arith: Record<string, string> = { "+": "operator_add", "-": "operator_subtract", "*": "operator_multiply", "/": "operator_divide", "%": "operator_mod" };
    const opcode = arith[expr.op];
    if (opcode) {
      const id = this.block(opcode, parent, expr.pos);
      this.valueInput(id, "NUM1", 4, "", expr.left);
      this.valueInput(id, "NUM2", 4, "", expr.right);
      return { kind: "block", id, bool: false };
    }
    if (expr.op === "and" || expr.op === "or") {
      const id = this.block(expr.op === "and" ? "operator_and" : "operator_or", parent, expr.pos);
      this.boolInput(id, "OPERAND1", expr.left);
      this.boolInput(id, "OPERAND2", expr.right);
      return { kind: "block", id, bool: true };
    }
    // a != b => not (a = b), a <= b => not (a > b), a >= b => not (a < b)
    const negated: Record<string, "=" | ">" | "<"> = { "!=": "=", "<=": ">", ">=": "<" };
    const inner = negated[expr.op];
    if (inner) {
      const id = this.block("operator_not", parent, expr.pos);
      this.boolInput(id, "OPERAND", { ...expr, op: inner });
      return { kind: "block", id, bool: true };
    }
    const cmp: Record<string, string> = { "<": "operator_lt", ">": "operator_gt", "=": "operator_equals" };
    const id = this.block(cmp[expr.op]!, parent, expr.pos);
    this.valueInput(id, "OPERAND1", 10, "", expr.left);
    this.valueInput(id, "OPERAND2", 10, "50", expr.right);
    return { kind: "block", id, bool: true };
  }
}

/** Gives a literal the primitive code of the slot it sits in, so number slots get [4, ...] and text slots [10, ...]. */
function retag(prim: CompactPrimitive, slotPrim: 4 | 5 | 6 | 7 | 8 | 10): CompactPrimitive {
  return [slotPrim, String(prim[1])];
}

/** Closest name by edit distance, for "did you mean" hints. */
function suggest(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestScore) {
      best = c;
      bestScore = d;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

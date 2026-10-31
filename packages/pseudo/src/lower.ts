import {
  IdGen, defaultBackdrop, isBuiltinShape, shapeCostume, svgCostume,
  type Asset, type Block, type CompactPrimitive, type Input, type Project,
  type ProjectJson, type ScalarValue, type SpriteTarget, type StageTarget, type Target,
} from "@bytecat/sb3";
import type { Declaration, Expr, Literal, ProgramNode, ScriptNode, Stmt, TargetNode } from "./ast.js";
import { REPORTERS, defaultShadow } from "./builtins.js";
import { PseudoError, type SourcePos } from "./errors.js";
import { callReporter, callStatement } from "./lower/calls.js";
import { controlStatement } from "./lower/control.js";
import { assign, itemOf, listField, listMember, listMethod, setItem } from "./lower/data.js";
import { whenHat } from "./lower/events.js";
import { binary, unary } from "./lower/operators.js";
import { defineHat, registerProcedure, returnStatement } from "./lower/procedures.js";
import type { Procedure, Symbol, Value } from "./lower/types.js";

// Lowering is split by block family. This file is the core: the project and target scopes,
// declarations, and the walk over scripts, statements and expressions with block id and source map
// handling. `lower/` has one file per family (control flow, data and lists, procedures, events,
// operators, builtin calls); each exports plain functions taking the `TargetBuilder` they lower into.

export interface LowerResult {
  project: Project;
  /** Maps every non-shadow block id to the pseudocode line it came from. */
  sourceMap: Record<string, { target: string; line: number }>;
}

/** The name of the stage list that `log(x)` appends to. */
export const LOG_LIST = "log";

const SPRITE_COLORS = ["#ffab19", "#4c97ff", "#59c059", "#ff6680", "#9966ff", "#0fbd8c"];

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
    // Pen is an extension: a project that uses it lists it, as the Scratch editor saves it.
    extensions: targets.some((t) => Object.values(t.blocks).some((b) => typeof b === "object" && !Array.isArray(b) && b.opcode.startsWith("pen_"))) ? ["pen"] : [],
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

/** Lowers one target. The members without `private` are what the family files in `lower/` use. */
export class TargetBuilder {
  private readonly blocks: Record<string, Block> = {};
  private readonly vars = new Map<string, Symbol>();
  private readonly lists = new Map<string, Symbol>();
  private readonly varOut: Target["variables"] = {};
  private readonly listOut: Target["lists"] = {};
  readonly procedures = new Map<string, Procedure>();
  readonly costumes: Asset[] = [];
  params: Procedure["params"] | null = null;
  private scriptY = 0;

  constructor(
    readonly scope: ProjectScope,
    private readonly node: TargetNode,
    readonly isStage: boolean,
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
    for (const script of this.node.scripts) if (script.kind === "define") registerProcedure(this, script);
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

  error(message: string, pos: SourcePos): PseudoError {
    return this.scope.error(message, pos);
  }

  block(opcode: string, parent: string | null, pos: SourcePos | null, extra: Partial<Block> = {}): string {
    const id = this.scope.ids.id();
    this.blocks[id] = { opcode, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel: false, ...extra };
    if (pos && !this.blocks[id]!.shadow) this.scope.sourceMap[id] = { target: this.node.name, line: pos.line };
    return id;
  }

  get(id: string): Block {
    return this.blocks[id]!;
  }

  variable(name: string, pos: SourcePos): Symbol {
    const v = this.vars.get(name) ?? this.scope.globals.get(name);
    if (v) return v;
    if (this.lists.has(name) || this.scope.globalLists.has(name)) {
      throw this.error(`'${name}' is a list, not a variable`, pos);
    }
    throw this.error(`unknown variable '${name}'. Declare it first with 'var ${name} = 0'`, pos);
  }

  list(name: string, pos: SourcePos): Symbol {
    const l = this.lists.get(name) ?? this.scope.globalLists.get(name);
    if (l) return l;
    if (this.vars.has(name) || this.scope.globals.has(name)) {
      throw this.error(`'${name}' is a variable, not a list`, pos);
    }
    throw this.error(`unknown list '${name}'. Declare it first with 'list ${name}'`, pos);
  }

  // ---- scripts ----

  private script(script: ScriptNode): void {
    const pos = { x: 0, y: this.scriptY };
    const hat = script.kind === "when" ? whenHat(this, script) : defineHat(this, script);
    Object.assign(this.get(hat), { topLevel: true, ...pos });
    const before = Object.keys(this.blocks).length;
    const first = this.statements(script.body, hat);
    this.get(hat).next = first;
    this.params = null;
    // Leave room below each script so they do not overlap when opened in the editor.
    this.scriptY += 80 + (Object.keys(this.blocks).length - before) * 24;
  }

  /** Lowers a statement list and chains it under `parent`. Returns the first block id. */
  statements(stmts: Stmt[], parent: string): string | null {
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
        return assign(this, stmt, parent);
      case "setItem":
        return setItem(this, stmt, parent);
      case "method":
        return listMethod(this, stmt, parent);
      case "call":
        return callStatement(this, stmt, parent);
      case "return":
        return returnStatement(this, stmt, parent);
      case "if":
      case "repeat":
      case "forever":
      case "allAtOnce":
      case "until":
      case "while":
      case "for":
        return controlStatement(this, stmt, parent);
    }
  }

  // ---- expressions ----

  valueInput(id: string, input: string, prim: 4 | 5 | 6 | 7 | 8 | 9 | 10, def: string, expr: Expr): void {
    const v = this.value(expr, id);
    const shadow = defaultShadow({ kind: "value", input, prim, default: def });
    const inp: Input = v.kind === "prim"
      ? v.prim[0] >= 11 ? [3, v.prim, shadow] : [1, retag(v.prim, prim)]
      : [3, v.id, shadow];
    this.get(id).inputs[input] = inp;
  }

  boolInput(id: string, input: string, expr: Expr): void {
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
  reporterBlock(expr: Expr, parent: string): string {
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
      case "index":
        return itemOf(this, expr, parent);
      case "member":
        return listMember(this, expr, parent);
      case "call":
        return callReporter(this, expr, parent);
      case "unary":
        return unary(this, expr, parent);
      case "binary":
        return binary(this, expr, parent);
    }
  }
}

/** Gives a literal the primitive code of the slot it sits in, so number slots get [4, ...] and text slots [10, ...]. */
function retag(prim: CompactPrimitive, slotPrim: 4 | 5 | 6 | 7 | 8 | 9 | 10): CompactPrimitive {
  // A color slot only holds `#rrggbb`; anything else goes in as text, which the block casts.
  if (slotPrim === 9 && !/^#[0-9a-fA-F]{6}$/.test(String(prim[1]))) return [10, String(prim[1])];
  return [slotPrim, String(prim[1])];
}

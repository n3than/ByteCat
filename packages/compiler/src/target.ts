import type { Block, CompactPrimitive, Input, InputValue, Target } from "@bytecat/sb3";
import { TypeEnv } from "./analysis/env.js";
import { analyzeEffects, type Effects } from "./analysis/effects.js";
import { analyzeSync, collectProcedures } from "./analysis/procedures.js";
import { ZERO, type TypeSet } from "./analysis/typeset.js";
import { builtins } from "./extensions/index.js";
import type { ExtensionRegistry } from "./extensions/registry.js";
import { anyEx, asAny, asBool, asNum, asStr, indent, lit, strEx } from "./cast.js";
import { Scope } from "./scope.js";
import type { Ex, FieldRef, Gen, Proc } from "./types.js";

/** Compiles the procedures and hat scripts of one target. */
export class TargetCodegen implements Gen {
  private readonly blocks: Record<string, Block>;
  private readonly procs: Map<string, Proc>;
  private readonly scope: Scope;
  procedure: Proc | undefined;
  private params = new Map<string, string>();
  /** Type-environment keys of the current procedure's arguments, by argument name. */
  private paramKeys = new Map<string, string>();
  private counter = 0;
  /** Set while compiling the body of a warp procedure, where loops never yield. */
  private inWarp = false;
  /** Set when the code compiled since the last reset can yield. */
  private yields = false;
  /** Every procedure definition with its compiled body. */
  private readonly procDefs: { proc: Proc; body: string[] }[];
  /** What each procedure can do to variables, by function name. */
  private readonly effects = new Map<string, Effects>();
  /** Storage references of the variables the function being compiled uses, in order of first use. */
  private refs: string[] = [];
  /** The ones used inside a loop, which are worth keeping in JavaScript locals. */
  private hot = new Set<string>();
  /** The ones the function assigns. */
  private assigned = new Set<string>();
  /** How many loops the block being compiled is inside, in the current function. */
  private loopDepth = 0;

  constructor(
    readonly target: Target,
    private readonly index: number,
    private readonly stage: Target,
    private readonly warnings: Set<string>,
    prelude: string[],
    private readonly env: TypeEnv,
    /** Names of all costumes, backdrops and sounds in the project. */
    private readonly assetNames: ReadonlySet<string> = new Set(),
    /** The extensions whose blocks this target may use. */
    private readonly registry: ExtensionRegistry = builtins,
  ) {
    this.scope = new Scope(target, stage, prelude);
    this.blocks = target.blocks;
    const table = collectProcedures(target, index);
    this.procs = table.procs;
    // Settle which procedures are sync before compiling any call to them.
    analyzeSync(target, table, registry);
    const effects = analyzeEffects(this.blocks, table, (field) => this.scope.variable(field));
    for (const [proccode, proc] of this.procs) {
      const e = effects.get(proccode);
      if (e) this.effects.set(proc.fn, e);
    }
    this.procDefs = table.defs.map(({ proc, definition }) => ({ proc, body: this.procBody(proc, definition) }));
  }

  // ---- top level ----

  procedures(): string[] {
    const out: string[] = [];
    for (const { proc, body } of this.procDefs) {
      const args = proc.params.map((_, j) => `a${j}`);
      out.push(`function${proc.sync ? "" : "*"} ${proc.fn}(${["t", "th", ...args].join(", ")}) {`);
      out.push(...indent(body));
      out.push("}");
    }
    return out;
  }

  private procBody(proc: Proc, block: Block): string[] {
    this.params = new Map(proc.params.map((name, i) => [name, `a${i}`]));
    this.procedure = proc;
    this.paramKeys = new Map(proc.params.map((name, i) => [name, TypeEnv.paramKey(proc.fn, i)]));
    this.inWarp = proc.warp;
    this.yields = false;
    const body = this.withLocals(() => this.stack(block.next), this.effects.get(proc.fn));
    // The analysis and the handlers must agree, or a generator would be called as a plain function.
    if (this.yields === proc.sync) {
      throw new Error(`internal error: yield analysis disagrees with codegen for ${proc.fn}`);
    }
    this.params = new Map();
    this.procedure = undefined;
    this.paramKeys = new Map();
    this.inWarp = false;
    return body;
  }

  /**
   * The hat scripts, each with the event that starts it (`HatSpec.event`) and the argument it
   * matches, read from the hat's `matchField` and lowercased. A hat the extension declares but
   * cannot start is reported as unsupported, and so is an unknown block with a script under it;
   * other top-level blocks never run.
   */
  hats(): string[] {
    const out: string[] = [];
    for (const block of Object.values(this.blocks)) {
      if (!block.topLevel) continue;
      const spec = this.registry.hat(block.opcode);
      if (!spec) {
        // An unknown block with a script under it is most likely a hat of an unknown extension.
        if (block.next && !this.registry.spec(block.opcode)) this.warnings.add(block.opcode);
        continue;
      }
      if (spec.definesProcedure) continue;
      // An edge-activated hat needs the scheduler to check its predicate, which it cannot yet.
      if (spec.event === undefined || spec.edgeActivated) {
        this.warnings.add(block.opcode);
        continue;
      }
      const arg = spec.matchField === undefined ? undefined : (block.fields[spec.matchField]?.[0] ?? "").toLowerCase();
      const body = indent(this.withLocals(() => this.stack(block.next)), 2).join("\n");
      const argPart = arg === undefined ? "" : ` arg: ${JSON.stringify(arg)},`;
      out.push(`{ target: ${this.index}, kind: "${spec.event}",${argPart} fn: function* (t, th) {\n${body}\n} }`);
    }
    return out;
  }

  // ---- variables in locals ----

  /**
   * Compiles one function body, keeping the variables it uses inside loops in JavaScript locals,
   * which are much faster than the target's variable objects. Handlers get a placeholder for each
   * variable (`variable`), replaced here by the local or by the storage reference. Locals are
   * loaded on entry and stored back wherever another script or a called procedure could see the
   * variables: before every yield, call and exit (handlers place `store` and `load` lines there,
   * see `Gen`), and at the end. Other scripts only run while this one is yielded, so between those
   * points the locals are the truth. A procedure's `effects` are checked against its body.
   */
  private withLocals(compile: () => string[], effects?: Effects): string[] {
    this.refs = [];
    this.hot = new Set();
    this.assigned = new Set();
    this.loopDepth = 0;
    const body = [...compile(), STORE];
    const { refs, assigned } = this;
    if (effects) {
      for (const ref of refs) {
        if (!effects.reads.has(ref) && !effects.writes.has(ref)) throw new Error(`internal error: effects miss a use of ${ref}`);
      }
      for (const ref of assigned) {
        if (!effects.writes.has(ref)) throw new Error(`internal error: effects miss an assignment to ${ref}`);
      }
    }
    const locals = new Map<string, string>();
    for (const ref of refs) if (this.hot.has(ref)) locals.set(ref, `v${locals.size}`);
    const stored = [...assigned].filter((ref) => locals.has(ref));
    const out = locals.size === 0 ? [] : [`let ${[...locals].map(([ref, local]) => `${local} = ${ref}`).join(", ")};`];
    for (const raw of body) {
      const line = raw.replace(/\u0002(\d+)\u0002/g, (_, i: string) => {
        const ref = refs[Number(i)]!;
        return locals.get(ref) ?? ref;
      });
      const at = line.indexOf(MARK);
      if (at < 0) {
        out.push(line);
        continue;
      }
      const [kind, fn] = line.slice(at + 1).split(":");
      const callee = fn ? this.effects.get(fn) : undefined;
      const code =
        kind === "store"
          ? // A sync callee only needs the variables it reads or writes (it may load a variable into
            // a local and store it back unchanged on a path that skips the assignment), unless it can
            // stop everything.
            stored
              .filter((ref) => !callee || callee.stops || callee.reads.has(ref) || callee.writes.has(ref))
              .map((ref) => `${ref} = ${locals.get(ref)};`)
          : [...locals].filter(([ref]) => !callee || callee.writes.has(ref)).map(([ref, local]) => `${local} = ${ref};`);
      if (code.length > 0) out.push(line.slice(0, at) + code.join(" "));
    }
    this.refs = [];
    return collapseYields(out);
  }

  store(proc?: Proc): string {
    return proc?.sync ? `${MARK}store:${proc.fn}` : `${MARK}store`;
  }

  load(proc?: Proc): string {
    return proc?.sync ? `${MARK}load:${proc.fn}` : `${MARK}load`;
  }

  // ---- Gen: services for block handlers ----

  stack(id: string | null | undefined): string[] {
    const lines: string[] = [];
    while (id) {
      const block = this.blocks[id];
      if (!block) break;
      lines.push(...this.statement(block));
      id = block.next;
    }
    return lines;
  }

  substack(block: Block, name: string): string[] {
    const v = block.inputs[name]?.[1];
    return indent(typeof v === "string" ? this.stack(v) : []);
  }

  tmp(): string {
    return `r${this.counter++}`;
  }

  /**
   * The end of every loop iteration outside warp mode. A thread yields to the scheduler unless it
   * is inside a warp procedure or `rt.spin` says it may keep going: the runtime sets `spin` above
   * zero only for a thread running alone with nothing to redraw (see `Runtime.tick`).
   */
  loopYield(): string[] {
    if (this.inWarp) return [];
    this.yields = true;
    return ["  if (th.warp === 0 && --rt.spin < 0) {", `    ${this.store()}`, "    yield;", `    ${this.load()}`, "  }"];
  }

  y(line: string): string[] {
    this.yields = true;
    return [this.store(), line, this.load()];
  }

  markYields(): void {
    this.yields = true;
  }

  proc(proccode: string | undefined): Proc | undefined {
    return proccode ? this.procs.get(proccode) : undefined;
  }

  param(name: string): string | undefined {
    return this.params.get(name);
  }

  paramType(name: string): TypeSet {
    const key = this.paramKeys.get(name);
    return key === undefined ? 0 : this.env.get(key);
  }

  noteCall(proc: Proc, args: TypeSet[]): void {
    args.forEach((type, i) => this.env.note(TypeEnv.paramKey(proc.fn, i), type));
  }

  variable(field: FieldRef): string {
    const ref = this.scope.variable(field);
    let i = this.refs.indexOf(ref);
    if (i < 0) i = this.refs.push(ref) - 1;
    if (this.loopDepth > 0) this.hot.add(ref);
    return `\u0002${i}\u0002`;
  }

  varType(field: FieldRef): TypeSet {
    return this.env.get(this.varKey(field));
  }

  noteWrite(field: FieldRef, type: TypeSet): void {
    this.assigned.add(this.scope.variable(field));
    this.env.note(this.varKey(field), type);
  }

  listType(field: FieldRef): TypeSet {
    return this.env.get(this.listKey(field));
  }

  noteListWrite(field: FieldRef, type: TypeSet): void {
    this.env.note(this.listKey(field), type);
  }

  private listKey(field: FieldRef): string {
    const slot = this.scope.listSlot(field);
    return TypeEnv.listKey(slot.owner === "t" ? this.index : 0, slot.key);
  }

  private varKey(field: FieldRef): string {
    const slot = this.scope.variableSlot(field);
    const key = TypeEnv.variableKey(slot.owner === "t" ? this.index : 0, slot.key);
    // A variable the project never declares starts at 0 (see Scope).
    if (slot.key.startsWith("missing:") || !(slot.key in (slot.owner === "t" ? this.target : this.stage).variables)) {
      this.env.note(key, ZERO);
    }
    return key;
  }

  list(field: FieldRef): string {
    return this.scope.list(field);
  }

  field(b: Block, name: string): string {
    return b.fields[name]?.[0] ?? "";
  }

  num(b: Block, name: string): string {
    return asNum(this.input(b, name));
  }

  str(b: Block, name: string): string {
    return asStr(this.input(b, name));
  }

  bool(b: Block, name: string): string {
    return asBool(this.input(b, name));
  }

  any(b: Block, name: string): string {
    return asAny(this.input(b, name));
  }

  // ---- statements ----

  private statement(b: Block): string[] {
    const { statements } = this.registry;
    const handler = Object.hasOwn(statements, b.opcode) ? statements[b.opcode] : undefined;
    const loop = handler !== undefined && this.registry.statement(b.opcode)!.yields === "loop";
    if (loop) this.loopDepth++;
    const lines = handler?.(b, this);
    if (loop) this.loopDepth--;
    if (lines) return lines;
    this.warnings.add(b.opcode);
    return [`/* unsupported: ${b.opcode} */`];
  }

  // ---- inputs and reporters ----

  input(b: Block, name: string): Ex {
    const e = this.rawInput(b, name);
    // A literal equal to an asset name stays text, as in TurboWarp (`preserveStrings`): it may be
    // stored in a variable or list and later reach `switch costume to`, where the text "2" picks
    // the costume named "2" but the number 2 picks costume number 2.
    return e.k !== undefined && !e.text && this.assetNames.has(e.k) ? lit(e.k, true) : e;
  }

  private rawInput(b: Block, name: string): Ex {
    const inp: Input | undefined = b.inputs[name];
    if (!inp) return lit("");
    const v: InputValue = inp[1] ?? (inp.length > 2 ? (inp as [3, InputValue, InputValue])[2] : null);
    if (v === null) return lit("");
    if (Array.isArray(v)) return this.primitive(v);
    return this.reporter(v);
  }

  private primitive(p: CompactPrimitive): Ex {
    switch (p[0]) {
      case 12: return anyEx(this.variable([p[1], p[2]]), this.varType([p[1], p[2]]));
      case 13: return strEx(`listContents(${this.list([p[1], p[2]])})`);
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
    const { reporters } = this.registry;
    const handler = Object.hasOwn(reporters, b.opcode) ? reporters[b.opcode] : undefined;
    const ex = handler?.(b, this);
    if (ex) return ex;
    this.warnings.add(b.opcode);
    return lit("");
  }
}

/** Starts the placeholder lines for storing and loading cached variables (`TargetCodegen.store`). */
const MARK = "\u0001";
const STORE = `${MARK}store`;

/** `if (c) {` / `yield;` / `}` back on one line, where no variables needed storing around the yield. */
function collapseYields(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)((?:if|while) \(.*\)) \{$/.exec(lines[i]!);
    const body = lines[i + 1];
    if (head && body?.trim().startsWith("yield") && lines[i + 2] === `${head[1]}}` && body.startsWith(`${head[1]}  `)) {
      out.push(`${head[1]}${head[2]} ${body.trim()}`);
      i += 2;
    } else {
      out.push(lines[i]!);
    }
  }
  return out;
}

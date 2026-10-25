import type { Block, CompactPrimitive, Input, InputValue, Target } from "@bytecat/sb3";
import { analyzeSync, collectProcedures } from "./analysis/procedures.js";
import { statements, reporters } from "./blocks/index.js";
import { asAny, asBool, asName, asNum, asStr, indent, lit } from "./cast.js";
import { Scope } from "./scope.js";
import type { Ex, FieldRef, Gen, Proc } from "./types.js";

/** Compiles the procedures and hat scripts of one target. */
export class TargetCodegen implements Gen {
  private readonly blocks: Record<string, Block>;
  private readonly procs: Map<string, Proc>;
  private readonly scope: Scope;
  procedure: Proc | undefined;
  private params = new Map<string, string>();
  private counter = 0;
  /** Set while compiling the body of a warp procedure, where loops never yield. */
  private inWarp = false;
  /** Set when the code compiled since the last reset can yield. */
  private yields = false;
  /** Every procedure definition with its compiled body. */
  private readonly procDefs: { proc: Proc; body: string[] }[];

  constructor(
    readonly target: Target,
    private readonly index: number,
    stage: Target,
    private readonly warnings: Set<string>,
    prelude: string[],
    /** Names of all costumes, backdrops and sounds in the project. */
    private readonly assetNames: ReadonlySet<string> = new Set(),
  ) {
    this.scope = new Scope(target, stage, prelude);
    this.blocks = target.blocks;
    const table = collectProcedures(target, index);
    this.procs = table.procs;
    // Settle which procedures are sync before compiling any call to them.
    analyzeSync(target, table);
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
    this.inWarp = proc.warp;
    this.yields = false;
    const body = this.stack(block.next);
    // The analysis and the handlers must agree, or a generator would be called as a plain function.
    if (this.yields === proc.sync) {
      throw new Error(`internal error: yield analysis disagrees with codegen for ${proc.fn}`);
    }
    this.params = new Map();
    this.procedure = undefined;
    this.inWarp = false;
    return body;
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

  loopYield(): string[] {
    if (this.inWarp) return [];
    this.yields = true;
    return ["  if (th.warp === 0) yield;"];
  }

  y(line: string): string[] {
    this.yields = true;
    return [line];
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

  variable(field: FieldRef): string {
    return this.scope.variable(field);
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
    const e = this.input(b, name);
    // A literal equal to an asset name stays text, as in TurboWarp (`preserveStrings`): it may be
    // stored in a variable or list and later reach `switch costume to`, where the text "2" picks
    // the costume named "2" but the number 2 picks costume number 2.
    return e.k !== undefined && this.assetNames.has(e.k) ? asName(e) : asAny(e);
  }

  // ---- statements ----

  private statement(b: Block): string[] {
    const handler = Object.hasOwn(statements, b.opcode) ? statements[b.opcode] : undefined;
    const lines = handler?.(b, this);
    if (lines) return lines;
    this.warnings.add(b.opcode);
    return [`/* unsupported: ${b.opcode} */`];
  }

  // ---- inputs and reporters ----

  input(b: Block, name: string): Ex {
    const inp: Input | undefined = b.inputs[name];
    if (!inp) return lit("");
    const v: InputValue = inp[1] ?? (inp.length > 2 ? (inp as [3, InputValue, InputValue])[2] : null);
    if (v === null) return lit("");
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
    const handler = Object.hasOwn(reporters, b.opcode) ? reporters[b.opcode] : undefined;
    const ex = handler?.(b, this);
    if (ex) return ex;
    this.warnings.add(b.opcode);
    return lit("");
  }
}

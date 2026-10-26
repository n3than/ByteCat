// Random program generator for the differential fuzzer (see docs/fuzzing.md).
//
// generateProgram(seed) returns Bytecat pseudocode. The same seed always gives the same program:
// everything random comes from a seeded PRNG, never Math.random or the clock.
//
// The programs are small, finite and deterministic. They are built to be awkward for compilers that
// infer types: variables start with strings that look like numbers, expressions mix numbers, text and
// booleans, loops flip a variable's type, and list indexes are strange. Every observable step goes
// through log(), which the engines are compared on.
//
// Termination rules (the generator never breaks these):
// - loops have literal counts of at most 4, or run `(expr % 3)` times, and nest at most two deep;
// - `for` loops count over numeric literals and never write the counter; `while` and `repeat until`
//   loops carry their own bound counter that nothing else writes;
// - procedures only call lower-numbered procedures; the one recursive procedure stops at depth 3;
// - there is no random(), timer(), input or wait.
//
// String growth rule: a stored join (assigned, added to a list or passed as an argument) has at most
// one operand that can hold a long string; the rest are literals or numbers. Without it
// `x = join(x, y); y = join(x, x)` doubles the string on every step.
//
// KNOWN divergences are avoided with a comment starting `// KNOWN:` at the place that avoids them.

import { ops } from "@bytecat/runtime";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- literal pools (pseudocode spelling; strings include their quotes) ----

const NUMS_SMALL = ["0", "1", "-1", "2", "3", "1.5", "0.5", "10", "-1.5", "100"];
const NUMS_BIG = [
  "1e3", "0x10", "255", "360", "90", "2147483647", "2147483648", "4294967296", "-2147483649",
  "9007199254740993", "0.1", "0.2", "1e21", "1e-7", "1e308", "123456789012", "-0",
];
const STRS_AWKWARD = [
  '""', '" "', '"1.0"', '" 5 "', '"5 "', '"1e3"', '"0x10"', '"-0"', '"Infinity"', '"-Infinity"', '"NaN"', '"abc"',
  '"ABC"', '"true"', '"false"', '"é"', '"0"', '"1"', '"-1"',
];
const STRS_EXTRA = [
  '"infinity"', '"-infinity"', '"INFINITY"',
  '"\\t"', '".5"', '"5."', '"+5"', '"00"', '"0b11"', '"1,5"', '"a b"', '"10"', '"2"', '"3"', '"9"', '"É"',
  '"1 2"', '"last"', '"all"', '"LAST"', '"All"', '"😀"', '"0.0"', '"-5"', '"1e-7"', '"abC"', '"true "',
];
// List indexes. "random" and "any" are left out because they pick a random item.
const INDEXES = [
  '"last"', '"all"', '"LAST"', '"All"', "0", "-1", "1.5", '"1.0"', "99", '""', "1", "2", "3", '"2"', '" 2 "', "0.5", "2.9", '"abc"', '"NaN"',
  '"Infinity"', '"-Infinity"', "-0", "true",
];
const MATH_FUNCS = [
  "abs", "floor", "ceiling", "sqrt", "sin", "cos", "tan", "ln", "log10", "exp", "pow10", "asin", "acos", "atan", "round",
];
const LOOP_COUNTS = ["1", "2", "3", "4", '"2"', "2.5", "0", "-1", '" 3 "', "1.5", '"1.0"', "0.4", "3.5"];
const FOR_STARTS = ["0", "1", "2", "-1", "1.5", '"1"', '"1.0"', '" 2 "', '"-0"', "0.5", '"1e0"', "-2"];
const FOR_ENDS = ["1", "2", "3", '"2"', "2.5", '"3.0"', "0", "-1", "1.5"];
const REC_STARTS = ["0", '"0"', '" 0 "', "-1", "-0.5", "1", "2", '"1.0"'];
const COMPARE_OPS = ["<", ">", "=", "!=", "<=", ">="];
/** Expressions that are infinite at run time, and texts that equal Infinity ignoring case. */
const INF_EXPRS = ["(1 / 0)", "(0 - (1 / 0))", "(1e308 * 10)", "(0 - 1e308 * 10)"];
const INF_TEXTS = ['"infinity"', '"-infinity"', '"INFINITY"', '"-Infinity"', '"Infinity"', '"inf"'];
/**
 * Values for `inftext`, a global only ever set to these. Its type stays "infinite number or text
 * that is not numeric", the type that lets a typed compiler compare it with a number by ===.
 */
const INF_VALUES = ['"infinity"', '"-infinity"', '"INFINITY"', '"inf"', '""', ...INF_EXPRS];
const ARITH_OPS = ["+", "-", "*", "/", "%"];
const CHANGE_OPS = ["+=", "-=", "*=", "/="];

interface Param {
  name: string;
  bool: boolean;
}

interface Proc {
  name: string;
  params: Param[];
  warp: boolean;
  recursive: boolean;
  /** Parameter names of a recursive procedure: the depth counter is the last one. */
}

/** The place a script lives: the stage or a sprite. */
interface Owner {
  name: string;
  /** Local variables (empty for the stage, whose variables are the globals). */
  vars: string[];
  lists: string[];
  /** Loop counters declared for this owner's scripts and procedures. */
  counters: string[];
  procs: Proc[];
}

interface Scope {
  owner: Owner;
  params: Param[];
  procs: Proc[];
  loopDepth: number;
  /** True inside the recursive procedure, where a loop counter would be clobbered by the recursion. */
  noCounters: boolean;
  allowBroadcast: boolean;
}

/** A generated expression: its code, whether it can be NaN, and its value when it is a plain literal. */
interface Ex {
  s: string;
  nan: boolean;
  k?: number;
  /** A boolean block (comparison, and, or, not, contains). */
  b?: boolean;
}

const ok = (s: string): Ex => ({ s, nan: false });

/** Scratch arithmetic on two numbers, used to tell whether a constant expression is NaN. */
function evalArith(op: string, a: number, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    default: return ops.mod(a, b);
  }
}

function evalMath(f: string, x: number): number {
  switch (f) {
    case "round": return Math.round(x);
    case "log10": return ops.mathop("log", x);
    case "exp": return ops.mathop("e ^", x);
    case "pow10": return ops.mathop("10 ^", x);
    default: return ops.mathop(f, x);
  }
}

/** Math functions that can return NaN for a number that is not NaN. */
const NAN_FUNCS = new Set(["sqrt", "ln", "log10", "sin", "cos", "tan", "asin", "acos"]);

interface Script {
  hat: string;
  stmts: string[][];
}

const renderScript = (s: Script): string[] => [`${s.hat}:`, ...indent(s.stmts.flat())];

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  between(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  /** Picks by weight: entries are [weight, value]. */
  weighted<T>(entries: readonly (readonly [number, T])[]): T {
    const total = entries.reduce((s, [w]) => s + w, 0);
    let r = this.next() * total;
    for (const [w, v] of entries) {
      r -= w;
      if (r < 0) return v;
    }
    return entries[entries.length - 1]![1];
  }
}

const indent = (lines: string[]): string[] => lines.map((l) => `  ${l}`);
const wrapNeg = (lit: string): string => (lit.startsWith("-") ? `(${lit})` : lit);

class Generator {
  private readonly r: Rng;
  private globalVars: string[] = [];
  private globalLists: string[] = [];
  private stageOwner: Owner = { name: "stage", vars: [], lists: [], counters: [], procs: [] };
  private counterId = 0;
  private procId = 0;
  private broadcasts = 0;
  private hasReceiver = false;
  /** More than one script, so threads can interleave. */

  constructor(seed: number) {
    this.r = new Rng(seed);
  }

  // ---- literals ----

  private numLit(): string {
    return this.r.chance(0.75) ? this.r.pick(NUMS_SMALL) : this.r.pick(NUMS_BIG);
  }

  /**
   * A string literal. In an expression it is never the tab string.
   * KNOWN: Bytecat's compiler decides at compile time that a blank literal such as "\t" is text, using
   * JavaScript's trim(); TurboWarp counts a tab as a zero, so `"0" = "\t"` is true there and false
   * in Bytecat. (runtime/src/ops.ts matches TurboWarp, so a variable holding "\t" is fine.) A tab is
   * still allowed in declarations and list items. See docs/deviations.md.
   */
  private strLit(inExpression = false): string {
    const s = this.r.chance(0.7) ? this.r.pick(STRS_AWKWARD) : this.r.pick(STRS_EXTRA);
    return inExpression && s === '"\\t"' ? '" "' : s;
  }

  /** A literal for a declaration or list item (bare, negative numbers allowed). */
  private rawLit(): string {
    return this.r.chance(0.45) ? this.numLit() : this.strLit();
  }

  // ---- expressions ----
  //
  // KNOWN: Bytecat gives a numeric expression the type "number" and skips the cast to number when it
  // feeds another numeric operation, but Scratch (and TurboWarp) turn NaN into 0 there:
  // `(0 / 0) + 1` is 1 in TurboWarp and NaN in Bytecat; `(0 / 0) > -1` is true and false.
  // A subexpression that can be NaN (see nanRisk) is therefore only used where no number cast
  // happens (log, set, add, join, procedure arguments). Where a number is wanted it is wrapped
  // as join("", e), which gives the same value in Scratch's rules and hides the NaN from the
  // compiler's number type. See docs/deviations.md.

  private readable(sc: Scope): string[] {
    return [...this.globalVars, ...sc.owner.vars, ...sc.owner.counters];
  }

  private writable(sc: Scope): string[] {
    return [...this.globalVars, ...sc.owner.vars];
  }

  private lists(sc: Scope): string[] {
    return [...this.globalLists, ...sc.owner.lists];
  }

  /** The expression as a number operand: a possible NaN is hidden behind join("", e). */
  private launder(e: Ex): string {
    return e.nan ? `join("", ${e.s})` : e.s;
  }

  /** An operand of a numeric operation. */
  private num(sc: Scope, depth: number): string {
    return this.launder(this.value(sc, depth, false));
  }

  /** A value that nothing casts to a number (log, set, join, argument), so a NaN can stay. */
  private free(sc: Scope, depth: number, stored: boolean): string {
    return this.value(sc, depth, stored).s;
  }

  private index(sc: Scope, depth: number): string {
    const k = this.r.float();
    if (k < 0.55) return wrapNeg(this.r.pick(INDEXES));
    if (k < 0.75) return this.varRead(sc) ?? "1";
    return this.num(sc, depth);
  }

  private varRead(sc: Scope): string | null {
    const names: string[] = [...this.readable(sc), ...sc.params.map((p) => p.name)];
    return names.length ? this.r.pick(names) : null;
  }

  /** A single value with no operators: literal, variable, parameter, list item. */
  private atom(sc: Scope, depth: number): Ex {
    const k = this.r.float();
    if (k < 0.3) return this.litEx();
    if (k < 0.75) {
      const v = this.varRead(sc);
      return v ? ok(v) : this.litEx();
    }
    const lists = this.lists(sc);
    if (lists.length && k < 0.9) {
      const l = this.r.pick(lists);
      return ok(this.r.weighted<string>([
        [5, `${l}[${this.index(sc, depth)}]`],
        [2, `${l}.length`],
        [1, l],
        [1, `${l}.index_of(${this.free(sc, depth, false)})`],
      ]));
    }
    return this.r.chance(0.5) ? ok(this.r.pick(["true", "false"])) : this.litEx();
  }

  /** A random literal with its numeric value, so arithmetic on it can be judged for NaN. */
  private litEx(): Ex {
    const text = this.r.chance(0.55) ? this.numLit() : this.strLit(true);
    const content = text.startsWith('"') ? (JSON.parse(text) as string) : text;
    const n = Number(content);
    return { s: wrapNeg(text), nan: false, k: Number.isNaN(n) ? 0 : n };
  }

  /** A numeric result (arithmetic, math, length) that is safe to put in a stored join. */
  private numeric(sc: Scope, depth: number): Ex {
    const k = this.r.float();
    if (depth <= 0 || k < 0.3) {
      return this.r.chance(0.7) ? ok(this.numLitExpr()) : ok(`length(${this.free(sc, 0, false)})`);
    }
    if (k < 0.9) return this.arith(sc, depth - 1);
    return ok(`length(${this.free(sc, depth - 1, false)})`);
  }

  private numLitExpr(): string {
    return wrapNeg(this.numLit());
  }

  private arith(sc: Scope, depth: number): Ex {
    const op = this.r.pick(ARITH_OPS);
    const a = this.value(sc, depth, false);
    const b = this.value(sc, depth, false);
    const s = `(${this.launder(a)} ${op} ${this.launder(b)})`;
    // Two known numbers: compute the result, so nesting stays numeric when it cannot be NaN.
    if (a.k !== undefined && b.k !== undefined && !a.nan && !b.nan) {
      const r = evalArith(op, a.k, b.k);
      return { s, nan: Number.isNaN(r), k: r };
    }
    const finite = (e: Ex): boolean => e.k !== undefined && Number.isFinite(e.k);
    const finiteNonZero = (e: Ex): boolean => finite(e) && e.k !== 0;
    // Can the operation produce NaN from operands that are not NaN? Infinity - Infinity,
    // Infinity * 0, 0 / 0, Infinity / Infinity and Infinity % n all do.
    let risky: boolean;
    if (op === "+" || op === "-") risky = !(finite(a) || finite(b));
    else if (op === "*") risky = !(finiteNonZero(a) || finiteNonZero(b));
    else if (op === "/") risky = !finiteNonZero(b);
    else risky = true;
    return { s, nan: risky };
  }

  private join(sc: Scope, depth: number, stored: boolean): Ex {
    const n = this.r.weighted([[4, 2], [1, 3]]);
    // When the result is stored, only one operand may be a variable-like string; see the header.
    const stringy = stored ? (this.r.chance(0.7) ? this.r.int(n) : -1) : -2;
    const ops: string[] = [];
    for (let i = 0; i < n; i++) {
      if (stringy === -2) ops.push(this.free(sc, depth - 1, false));
      else if (i === stringy) ops.push(this.free(sc, depth - 1, true));
      else ops.push(this.r.chance(0.5) ? this.litEx().s : this.numeric(sc, depth - 1).s);
    }
    return ok(`join(${ops.join(", ")})`);
  }

  /** `stored` says the result is kept in a variable, list or argument (it may then be read again). */
  private value(sc: Scope, depth: number, stored: boolean): Ex {
    if (depth <= 0) return this.atom(sc, 0);
    const lists = this.lists(sc);
    const k = this.r.weighted<string>([
      [26, "atom"],
      [24, "arith"],
      [8, "math"],
      [8, "join"],
      [4, "letter"],
      [3, "length"],
      [4, "contains"],
      [6, "bool"],
      [3, "neg"],
      [lists.length ? 3 : 0, "listitem"],
    ]);
    switch (k) {
      case "arith":
        return this.arith(sc, depth - 1);
      case "math": {
        const f = this.r.pick(MATH_FUNCS);
        const x = this.value(sc, depth - 1, false);
        const s = `${f}(${this.launder(x)})`;
        if (x.k !== undefined && !x.nan) {
          const r = evalMath(f, x.k);
          return { s, nan: Number.isNaN(r), k: r };
        }
        return { s, nan: NAN_FUNCS.has(f) };
      }
      case "join":
        return this.join(sc, depth, stored);
      case "letter":
        return ok(`letter(${this.num(sc, depth - 1)}, ${this.free(sc, depth - 1, false)})`);
      case "length":
        return ok(`length(${this.free(sc, depth - 1, false)})`);
      case "contains":
        return { s: `contains(${this.free(sc, depth - 1, false)}, ${this.free(sc, depth - 1, false)})`, nan: false, b: true };
      case "bool":
        return { s: this.bool(sc, depth - 1), nan: false, b: true };
      case "neg": {
        const e = this.value(sc, depth - 1, false);
        const inner = this.launder(e);
        // -0x10 would be folded into the text "-0x10", which is not a number; keep a space between.
        const s = /^0x/i.test(inner) ? `(0 - ${inner})` : `(-${inner})`;
        return e.k !== undefined && !e.nan ? { s, nan: false, k: 0 - e.k } : ok(s);
      }
      case "listitem": {
        const l = this.r.pick(lists);
        return ok(`${l}[${this.index(sc, depth - 1)}]`);
      }
      default:
        return this.atom(sc, depth);
    }
  }

  /** A boolean expression, always parenthesised or a plain name so it can sit anywhere. */
  private bool(sc: Scope, depth: number): string {
    const boolParams = sc.params.filter((p) => p.bool).map((p) => p.name);
    const lists = this.lists(sc);
    const k = this.r.weighted<string>([
      [depth > 0 ? 46 : 60, "cmp"],
      [depth > 0 ? 14 : 0, "andor"],
      [depth > 0 ? 8 : 0, "not"],
      [6, "contains"],
      [lists.length ? 6 : 0, "listcontains"],
      [3, "const"],
      [boolParams.length ? 12 : 0, "param"],
      [8, "infcmp"],
    ]);
    switch (k) {
      case "andor":
        return `(${this.bool(sc, depth - 1)} ${this.r.pick(["and", "or"])} ${this.bool(sc, depth - 1)})`;
      case "not":
        return `(not ${this.bool(sc, depth - 1)})`;
      case "contains":
        return `contains(${this.free(sc, 1, false)}, ${this.free(sc, 1, false)})`;
      case "listcontains":
        return `${this.r.pick(lists)}.contains(${this.free(sc, 1, false)})`;
      case "const":
        return this.r.pick(["true", "false"]);
      case "param":
        return this.r.pick(boolParams);
      case "infcmp": {
        // An infinite number against text that reads as Infinity ignoring case, the case where a
        // number may not be compared with === (the text "infinity" is not a numeric string).
        const vars = this.readable(sc);
        const num = vars.length && this.r.chance(0.3) ? this.r.pick(vars) : this.r.pick(INF_EXPRS);
        const text = this.r.chance(0.5) ? "inftext" : vars.length && this.r.chance(0.3) ? this.r.pick(vars) : this.r.pick(INF_TEXTS);
        const [a, b] = this.r.chance(0.5) ? [num, text] : [text, num];
        return `(${a} ${this.r.pick(["=", "=", "!=", "<", ">"])} ${b})`;
      }
      default: {
        const d = Math.min(depth, 2);
        const op = this.r.pick(COMPARE_OPS);
        const ordered = op !== "=" && op !== "!=";
        // KNOWN: when a variable holds NaN, `var > (1 < 2)` is true in TurboWarp (its typed compare
        // reads the boolean as the number 1) and false in scratch-vm and Bytecat. A boolean block under
        // < or > is therefore wrapped as join("", e), the text "true" or "false". See docs/deviations.md.
        // KNOWN: TurboWarp compiles a literal "Infinity" or "-Infinity" in a comparison as a number
        // constant, so `"Infinity" = x` is false there for x = "infinity"; scratch-vm and Bytecat say
        // true (equal as text, ignoring case). Such a literal operand is replaced by a computed
        // infinity, which compares the same way on every engine. See docs/deviations.md.
        const operand = (): string => {
          const e = this.value(sc, d, false);
          if (e.s === '"Infinity"') return "(1 / 0)";
          if (e.s === '"-Infinity"') return "(0 - (1 / 0))";
          return ordered && e.b ? `join("", ${e.s})` : this.launder(e);
        };
        return `(${operand()} ${op} ${operand()})`;
      }
    }
  }

  // ---- statements ----

  private block(sc: Scope, depth: number, count: number): string[] {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) lines.push(...this.statement(sc, depth));
    return lines;
  }

  private statement(sc: Scope, depth: number): string[] {
    const vars = this.writable(sc);
    const lists = this.lists(sc);
    const callable = sc.procs;
    const k = this.r.weighted<string>([
      [vars.length ? 20 : 0, "set"],
      [vars.length ? 10 : 0, "change"],
      [22, "log"],
      [lists.length ? 12 : 0, "list"],
      [depth < 2 ? 9 : 0, "if"],
      [depth < 2 && sc.loopDepth < 2 ? 11 : 0, "loop"],
      [callable.length && sc.loopDepth <= 1 ? 9 : 0, "call"],
      [sc.allowBroadcast && sc.loopDepth <= 1 ? 3 : 0, "broadcast"],
      [3, "setinf"],
    ]);
    switch (k) {
      case "setinf":
        return [`inftext = ${this.r.pick(INF_VALUES)}`];
      case "set": {
        const v = this.r.pick(vars);
        // Literal assignments set up a known type; the others change it.
        const e = this.r.chance(0.3) ? this.litEx().s : this.r.chance(0.2) ? this.bool(sc, 2) : this.free(sc, 3, true);
        return [`${v} = ${e}`];
      }
      case "change": {
        const v = this.r.pick(vars);
        const op = this.r.pick(CHANGE_OPS);
        return [`${v} ${op} ${this.r.chance(0.35) ? this.litEx().s : this.num(sc, 2)}`];
      }
      case "log": {
        const e = this.r.weighted<string>([
          [50, this.free(sc, 3, false)],
          [18, this.bool(sc, 2)],
          [20, this.varRead(sc) ?? this.litEx().s],
          [5, lists.length ? this.r.pick(lists) : this.litEx().s],
        ]);
        return [`log(${e})`];
      }
      case "list":
        return this.listStatement(sc);
      case "if": {
        const cond = this.bool(sc, 2);
        const lines = [`if ${cond}:`, ...indent(this.block(sc, depth + 1, this.r.between(1, 3)))];
        if (this.r.chance(0.45)) lines.push("else:", ...indent(this.block(sc, depth + 1, this.r.between(1, 3))));
        return lines;
      }
      case "loop":
        return this.loop(sc, depth);
      case "call":
        return [this.call(sc, this.r.pick(callable))];
      case "broadcast": {
        this.broadcasts++;
        return [this.r.chance(0.7) ? 'broadcast("go")' : 'broadcast_wait("go")'];
      }
      default:
        return ['log("?")'];
    }
  }

  private listStatement(sc: Scope): string[] {
    const l = this.r.pick(this.lists(sc));
    const item = (): string => (this.r.chance(0.4) ? this.litEx().s : this.free(sc, 2, true));
    const k = this.r.weighted<string>([
      [26, "add"],
      [16, "insert"],
      [16, "replace"],
      [18, "delete"],
      [2, "clear"],
      [10, "log"],
    ]);
    switch (k) {
      case "add":
        return [`${l}.add(${item()})`];
      case "insert":
        return [`${l}.insert(${this.index(sc, 1)}, ${item()})`];
      case "replace":
        return [`${l}[${this.index(sc, 1)}] = ${item()}`];
      case "delete":
        return [`${l}.delete(${this.index(sc, 1)})`];
      case "clear":
        return [`${l}.clear()`];
      default:
        return [`log(${l}.length)`, `log(${l})`];
    }
  }

  private newCounter(sc: Scope): string {
    const name = `k${this.counterId++}`;
    sc.owner.counters.push(name);
    return name;
  }

  private loop(sc: Scope, depth: number): string[] {
    const inner = { ...sc, loopDepth: sc.loopDepth + 1 };
    const body = (extra: string[] = []): string[] => indent([...this.block(inner, depth + 1, this.r.between(1, 4)), ...extra]);
    const kind = sc.noCounters ? "repeat" : this.r.weighted<string>([[4, "repeat"], [3, "for"], [2, "while"], [1, "until"]]);
    switch (kind) {
      case "for": {
        const c = this.newCounter(sc);
        return [`for ${c} = ${this.r.pick(FOR_STARTS)} to ${this.r.pick(FOR_ENDS)}:`, ...body()];
      }
      case "while":
      case "until": {
        const c = this.newCounter(sc);
        const bound = this.r.between(1, 3);
        const extra = this.r.chance(0.6) ? this.bool(sc, 1) : null;
        const init = [`${c} = ${this.r.pick(["0", "0", '"0"'])}`];
        const step = [`${c} += 1`];
        if (kind === "while") {
          const cond = extra ? `(${c} < ${bound} and ${extra})` : `${c} < ${bound}`;
          return [...init, `while ${cond}:`, ...body(step)];
        }
        const cond = extra ? `(${c} >= ${bound} or (not ${extra}))` : `${c} >= ${bound}`;
        return [...init, `repeat until ${cond}:`, ...body(step)];
      }
      default: {
        const n = this.r.chance(0.15) ? `(${this.num(sc, 1)} % ${this.r.between(1, 3)})` : this.r.pick(LOOP_COUNTS);
        return [`repeat ${n}:`, ...body()];
      }
    }
  }

  /**
   * A boolean argument for a procedure.
   * KNOWN: a bare `false` is an empty boolean slot, and a boolean parameter that receives one reads as
   * "" in Bytecat but as false in TurboWarp. `true` and every other condition are fine. See
   * docs/deviations.md.
   */
  private boolArg(sc: Scope): string {
    const e = this.r.chance(0.85) ? this.bool(sc, 2) : "true";
    return e === "false" ? "true" : e;
  }

  private call(sc: Scope, proc: Proc): string {
    const args = proc.params.map((p, i) => {
      if (proc.recursive && i === proc.params.length - 1) return this.r.pick(REC_STARTS);
      if (p.bool) return this.boolArg(sc);
      return this.r.chance(0.4) ? this.litEx().s : this.free(sc, 2, true);
    });
    return `${proc.name}(${args.join(", ")})`;
  }

  // ---- procedures and scripts ----

  private makeProc(owner: Owner, recursive: boolean): string[] {
    const name = `proc${this.procId++}`;
    const nParams = this.r.between(recursive ? 1 : 0, 3);
    const params: Param[] = [];
    for (let i = 0; i < nParams; i++) params.push({ name: `${recursive ? "r" : "x"}${i}`, bool: this.r.chance(0.2) });
    if (recursive) params.push({ name: "depth", bool: false });
    const warp = this.r.chance(0.5);
    const proc: Proc = { name, params, warp, recursive };
    const visible = recursive ? [] : [...owner.procs];
    const sc: Scope = {
      owner, params, procs: visible, loopDepth: 0, noCounters: recursive, allowBroadcast: false,
    };
    let lines: string[];
    if (recursive) {
      const first = params.find((p) => !p.bool && p.name !== "depth");
      const callArgs = params.map((p) => {
        if (p.name === "depth") return "(depth + 1)";
        if (p.bool) return this.boolArg(sc);
        return this.free(sc, 2, true);
      });
      lines = [
        ...(first ? [`log(${first.name})`, `log(depth)`] : [`log(depth)`]),
        ...this.block(sc, 1, this.r.between(0, 2)),
        `if depth < 3:`,
        ...indent([`${name}(${callArgs.join(", ")})`]),
        ...this.block(sc, 1, this.r.between(0, 2)),
        `log(depth)`,
      ];
    } else {
      lines = this.block(sc, 0, this.r.between(2, 5));
      if (params.length && this.r.chance(0.6)) lines.unshift(`log(${this.r.pick(params).name})`);
    }
    owner.procs.push(proc);
    const sig = params.map((p) => (p.bool ? `${p.name}: bool` : p.name)).join(", ");
    return [`define ${proc.warp ? "warp " : ""}${name}(${sig}):`, ...indent(lines)];
  }

  /** A script as its top-level statements, so a broadcast can be inserted between two of them. */
  private script(owner: Owner, hat: string, allowBroadcast: boolean): Script {
    const sc: Scope = {
      owner, params: [], procs: owner.procs, loopDepth: 0, noCounters: false, allowBroadcast,
    };
    const stmts: string[][] = [];
    for (let i = this.r.between(3, 8); i > 0; i--) stmts.push(this.statement(sc, 0));
    // End with a few log() calls so the final state is visible.
    const names = [...this.globalVars, ...owner.vars];
    for (let i = this.r.between(1, 3); i > 0 && names.length; i--) stmts.push([`log(${this.r.pick(names)})`]);
    const lists = [...this.globalLists, ...owner.lists];
    if (lists.length && this.r.chance(0.6)) stmts.push([`log(${this.r.pick(lists)})`]);
    return { hat, stmts };
  }

  // ---- whole program ----

  program(): string {
    const r = this.r;
    const decl = (name: string): string => `var ${name} = ${this.rawLit()}`;
    const listDecl = (name: string): string => {
      const items = Array.from({ length: r.between(0, 5) }, () => this.rawLit());
      return `list ${name} = [${items.join(", ")}]`;
    };

    this.globalVars = Array.from({ length: r.between(2, 5) }, (_, i) => `g${i}`);
    this.globalLists = Array.from({ length: r.weighted([[4, 0], [5, 1], [2, 2]]) }, (_, i) => `gl${i}`);
    const names = r.chance(0.7) ? ["A"] : ["A", "B"];
    const sprites: Owner[] = names.map((name) => {
      const lower = name.toLowerCase();
      return {
        name,
        vars: Array.from({ length: r.between(1, 3) }, (_, i) => `${lower}${i}`),
        lists: r.chance(0.35) ? [`${lower}l0`] : [],
        counters: [],
        procs: [],
      };
    });
    const stage = this.stageOwner;
    const stageHasScripts = r.chance(0.25);

    const globalDecls = ['var inftext = "infinity"', ...this.globalVars.map(decl), ...this.globalLists.map(listDecl)];
    // Declare the globals under `stage:` or at the top level, whichever the dice say.
    const globalsInStage = r.chance(0.4);

    // Decide the scripts: owner and hat.
    // KNOWN: Bytecat starts the scripts of one event in declaration order (stage, then sprites), but
    // TurboWarp and scratch-vm start the topmost sprite first and the stage last, so two `when flag`
    // scripts in different targets log in a different order. All flag scripts therefore live in one
    // target. A single receiver may sit in another target. See docs/deviations.md.
    const owners: Owner[] = [...sprites, stage];
    const flagOwner = stageHasScripts ? stage : r.pick(sprites);
    const hats: { owner: Owner; hat: string }[] = [{ owner: flagOwner, hat: "when flag" }];
    for (let extra = r.weighted([[6, 0], [3, 1], [1, 2]]); extra > 0; extra--) hats.push({ owner: flagOwner, hat: "when flag" });
    if (r.chance(0.35)) {
      this.hasReceiver = true;
      hats.push({ owner: r.pick(owners), hat: 'when receive "go"' });
    }

    // Procedures first, so that every script of a sprite can call all of them.
    const spriteProcs = new Map<string, string[]>();
    for (const sp of sprites) {
      const lines: string[] = [];
      const count = r.weighted([[3, 0], [3, 1], [3, 2], [2, 3]]);
      const withRec = r.chance(0.4);
      if (withRec) lines.push(...this.makeProc(sp, true));
      for (let i = 0; i < count; i++) lines.push(...this.makeProc(sp, false));
      spriteProcs.set(sp.name, lines);
    }

    const stageUsed = hats.some((h) => h.owner === stage);
    const scriptText = new Map<Owner, Script[]>();
    const flagScripts: Script[] = [];
    for (const h of hats) {
      const isReceiver = h.hat !== "when flag";
      const text = this.script(h.owner, h.hat, this.hasReceiver && !isReceiver);
      scriptText.set(h.owner, [...(scriptText.get(h.owner) ?? []), text]);
      if (!isReceiver) flagScripts.push(text);
    }
    // A receiver needs a sender: when the dice never broadcast, put one in a flag script.
    if (this.hasReceiver && this.broadcasts === 0) {
      const target = r.pick(flagScripts);
      target.stmts.splice(r.between(0, target.stmts.length), 0, [r.chance(0.7) ? 'broadcast("go")' : 'broadcast_wait("go")']);
    }

    const out: string[] = [];
    const counterDecls = (o: Owner): string[] => o.counters.map((c) => `var ${c} = 0`);
    if (!globalsInStage) out.push(...globalDecls);
    out.push(...counterDecls(stage));
    if (globalsInStage || stageUsed) {
      out.push("", "stage:");
      if (globalsInStage) out.push(...indent(globalDecls));
      for (const s of scriptText.get(stage) ?? []) out.push(...indent(renderScript(s)));
    }
    for (const sp of sprites) {
      out.push("", `sprite ${sp.name}:`);
      out.push(...indent(sp.vars.map(decl)));
      out.push(...indent(sp.lists.map(listDecl)));
      out.push(...indent(counterDecls(sp)));
      out.push(...indent(spriteProcs.get(sp.name)!));
      for (const s of scriptText.get(sp) ?? []) out.push(...indent(renderScript(s)));
    }
    return out.join("\n") + "\n";
  }
}

export function generateProgram(seed: number): string {
  return new Generator(seed).program();
}

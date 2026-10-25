import type {
  BinaryOp, Declaration, Expr, Hat, Literal, Param, ProgramNode, Property, ScriptNode, Stmt, TargetNode,
} from "./ast.js";
import { PseudoError, type SourcePos } from "./errors.js";
import { tokenize, type Token, type TokenKind } from "./lexer.js";

/** Words that cannot be used as variable, list or parameter names. */
export const RESERVED = new Set([
  "if", "elif", "else", "repeat", "until", "while", "forever", "for", "to",
  "and", "or", "not", "true", "false",
]);

export function parse(source: string, file?: string): ProgramNode {
  return new Parser(tokenize(source, file), file).program();
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[], private readonly file?: string) {}

  // ---- token helpers ----

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.i++;
    return t;
  }

  private is(kind: TokenKind, value?: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private isOp(value: string, offset = 0): boolean {
    return this.is("op", value, offset);
  }

  private isWord(value: string, offset = 0): boolean {
    return this.is("ident", value, offset);
  }

  private accept(kind: TokenKind, value?: string): Token | null {
    return this.is(kind, value) ? this.next() : null;
  }

  private expect(kind: TokenKind, value?: string, what?: string): Token {
    if (this.is(kind, value)) return this.next();
    throw this.error(`expected ${what ?? value ?? kind}, found ${describe(this.peek())}`);
  }

  private error(message: string, pos: SourcePos = this.peek().pos): PseudoError {
    return new PseudoError(message, pos, this.file);
  }

  private name(what: string): Token {
    const t = this.expect("ident", undefined, what);
    if (RESERVED.has(t.value)) throw this.error(`'${t.value}' is a reserved word and cannot be used as ${what}`, t.pos);
    return t;
  }

  /** A name that may also be written as a string, for names with spaces. */
  private label(what: string): string {
    const s = this.accept("string");
    return s ? s.value : this.name(what).value;
  }

  private endLine(): void {
    if (this.is("eof")) return;
    this.expect("newline", undefined, "end of line");
  }

  /** `:` NEWLINE INDENT ... DEDENT, calling `item` for each line inside. */
  private block<T>(item: () => T): T[] {
    this.expect("op", ":");
    this.expect("newline", undefined, "end of line after ':'");
    if (!this.is("indent")) throw this.error("expected an indented block");
    this.next();
    const items: T[] = [];
    while (!this.is("dedent") && !this.is("eof")) items.push(item());
    this.accept("dedent");
    return items;
  }

  // ---- top level ----

  program(): ProgramNode {
    const globals: Declaration[] = [];
    const targets: TargetNode[] = [];
    while (!this.is("eof")) {
      const t = this.peek();
      if (this.isWord("var") || this.isWord("list")) {
        globals.push(this.declaration());
      } else if (this.isWord("stage")) {
        this.next();
        targets.push(this.targetBody("stage", "Stage", t.pos));
      } else if (this.isWord("sprite")) {
        this.next();
        const name = this.label("a sprite name");
        targets.push(this.targetBody("sprite", name, t.pos));
      } else {
        throw this.error(`expected 'var', 'list', 'stage' or 'sprite' at top level, found ${describe(t)}`);
      }
    }
    return { globals, targets };
  }

  private targetBody(kind: "stage" | "sprite", name: string, pos: SourcePos): TargetNode {
    const node: TargetNode = { kind, name, pos, declarations: [], properties: [], scripts: [] };
    this.block(() => {
      const t = this.peek();
      if (t.kind !== "ident") throw this.error(`expected a declaration or script, found ${describe(t)}`);
      switch (t.value) {
        case "var":
        case "list":
          node.declarations.push(this.declaration());
          break;
        case "costume":
        case "backdrop":
          node.declarations.push(this.costume(kind));
          break;
        case "position":
        case "size":
        case "direction":
        case "hidden":
          if (kind === "stage") throw this.error(`the stage has no '${t.value}'`);
          node.properties.push(this.property());
          break;
        case "when":
          node.scripts.push(this.when());
          break;
        case "define":
          node.scripts.push(this.define());
          break;
        default:
          throw this.error(
            `expected var, list, costume, position, size, direction, hidden, when or define, found '${t.value}'. ` +
              "Statements must be inside a 'when' or 'define' script",
          );
      }
    });
    return node;
  }

  private literal(): Literal {
    const neg = this.accept("op", "-");
    const t = this.next();
    if (t.kind === "number") return { kind: "number", value: neg ? "-" + t.value : t.value };
    if (t.kind === "string" && !neg) return { kind: "string", value: t.value };
    throw this.error(`expected a number or string literal, found ${describe(t)}`, t.pos);
  }

  private declaration(): Declaration {
    const kw = this.next();
    const name = this.name(kw.value === "var" ? "a variable name" : "a list name").value;
    if (kw.value === "var") {
      let value: Literal = { kind: "number", value: "0" };
      if (this.accept("op", "=")) value = this.literal();
      this.endLine();
      return { kind: "var", name, value, pos: kw.pos };
    }
    const items: Literal[] = [];
    if (this.accept("op", "=")) {
      this.expect("op", "[");
      while (!this.isOp("]")) {
        items.push(this.literal());
        if (!this.accept("op", ",")) break;
      }
      this.expect("op", "]");
    }
    this.endLine();
    return { kind: "list", name, items, pos: kw.pos };
  }

  private costume(target: "stage" | "sprite"): Declaration {
    const kw = this.next();
    if (target === "stage" && kw.value === "costume") throw this.error("the stage has backdrops, not costumes", kw.pos);
    if (target === "sprite" && kw.value === "backdrop") throw this.error("sprites have costumes, not backdrops", kw.pos);
    const name = this.label("a costume name");
    let shape = target === "stage" ? "backdrop" : name;
    let color: string | undefined;
    if (target === "stage") {
      color = this.accept("string")?.value;
    } else if (this.accept("op", "=")) {
      shape = this.expect("ident", undefined, "a shape (circle, square or triangle)").value;
      color = this.accept("string")?.value;
    }
    this.endLine();
    return { kind: "costume", name, shape, ...(color !== undefined ? { color } : {}), pos: kw.pos };
  }

  private number(): number {
    const lit = this.literal();
    if (lit.kind !== "number") throw this.error("expected a number");
    return Number(lit.value);
  }

  private property(): Property {
    const kw = this.next();
    let p: Property;
    if (kw.value === "position") {
      const x = this.number();
      this.expect("op", ",");
      p = { kind: "position", x, y: this.number(), pos: kw.pos };
    } else if (kw.value === "size") {
      p = { kind: "size", value: this.number(), pos: kw.pos };
    } else if (kw.value === "direction") {
      p = { kind: "direction", value: this.number(), pos: kw.pos };
    } else {
      p = { kind: "hidden", pos: kw.pos };
    }
    this.endLine();
    return p;
  }

  private when(): ScriptNode {
    const kw = this.next();
    const t = this.expect("ident", undefined, "flag, clicked, key or receive");
    let hat: Hat;
    if (t.value === "flag") hat = { kind: "flag" };
    else if (t.value === "clicked") hat = { kind: "clicked" };
    else if (t.value === "key") hat = { kind: "key", key: this.expect("string", undefined, 'a key name like "space"').value };
    else if (t.value === "receive") hat = { kind: "receive", message: this.expect("string", undefined, "a message name").value };
    else throw this.error(`unknown event '${t.value}', expected flag, clicked, key or receive`, t.pos);
    return { kind: "when", hat, body: this.statements(), pos: kw.pos };
  }

  private define(): ScriptNode {
    const kw = this.next();
    const warp = !!this.accept("ident", "warp");
    const name = this.name("a procedure name").value;
    this.expect("op", "(");
    const params: Param[] = [];
    while (!this.isOp(")")) {
      const p = this.name("a parameter name").value;
      let boolean = false;
      if (this.accept("op", ":")) {
        const type = this.expect("ident", undefined, "a parameter type");
        if (type.value === "bool") boolean = true;
        else if (type.value !== "value") throw this.error(`unknown parameter type '${type.value}', expected value or bool`, type.pos);
      }
      if (params.some((q) => q.name === p)) throw this.error(`duplicate parameter '${p}'`);
      params.push({ name: p, boolean });
      if (!this.accept("op", ",")) break;
    }
    this.expect("op", ")");
    return { kind: "define", name, params, warp, body: this.statements(), pos: kw.pos };
  }

  // ---- statements ----

  private statements(): Stmt[] {
    return this.block(() => this.statement());
  }

  private statement(): Stmt {
    const t = this.peek();
    if (t.kind !== "ident") throw this.error(`expected a statement, found ${describe(t)}`);
    switch (t.value) {
      case "if":
        return this.ifStatement();
      case "repeat": {
        this.next();
        if (this.accept("ident", "until")) {
          const cond = this.expr();
          return { kind: "until", cond, body: this.statements(), pos: t.pos };
        }
        const count = this.expr();
        return { kind: "repeat", count, body: this.statements(), pos: t.pos };
      }
      case "forever":
        this.next();
        return { kind: "forever", body: this.statements(), pos: t.pos };
      case "while": {
        this.next();
        const cond = this.expr();
        return { kind: "while", cond, body: this.statements(), pos: t.pos };
      }
      case "for": {
        this.next();
        const variable = this.name("a loop variable").value;
        this.expect("op", "=");
        const from = this.expr();
        this.expect("ident", "to", "'to'");
        const to = this.expr();
        return { kind: "for", variable, from, to, body: this.statements(), pos: t.pos };
      }
      case "elif":
      case "else":
        throw this.error(`'${t.value}' without a matching 'if'`);
    }

    this.next();
    let stmt: Stmt;
    if (this.isOp("(")) {
      stmt = { kind: "call", callee: t.value, args: this.args(), pos: t.pos };
    } else if (this.isOp(".")) {
      this.next();
      const method = this.expect("ident", undefined, "a list method").value;
      stmt = { kind: "method", object: t.value, method, args: this.isOp("(") ? this.args() : [], pos: t.pos };
    } else if (this.isOp("[")) {
      this.next();
      const index = this.expr();
      this.expect("op", "]");
      this.expect("op", "=");
      stmt = { kind: "setItem", list: t.value, index, value: this.expr(), pos: t.pos };
    } else {
      const op = this.peek();
      if (op.kind === "op" && ["=", "+=", "-=", "*=", "/="].includes(op.value)) {
        if (RESERVED.has(t.value)) throw this.error(`'${t.value}' is a reserved word`, t.pos);
        this.next();
        stmt = { kind: "assign", target: t.value, op: op.value as "=", value: this.expr(), pos: t.pos };
      } else {
        throw this.error(`expected '(', '=', '+=', '.' or '[' after '${t.value}', found ${describe(op)}`, op.pos);
      }
    }
    this.endLine();
    return stmt;
  }

  private ifStatement(): Stmt {
    const kw = this.next();
    const cond = this.expr();
    const then = this.statements();
    let otherwise: Stmt[] | null = null;
    if (this.isWord("elif")) {
      otherwise = [this.ifStatement()];
    } else if (this.accept("ident", "else")) {
      otherwise = this.statements();
    }
    return { kind: "if", cond, then, else: otherwise, pos: kw.pos };
  }

  private args(): Expr[] {
    this.expect("op", "(");
    const args: Expr[] = [];
    while (!this.isOp(")")) {
      args.push(this.expr());
      if (!this.accept("op", ",")) break;
    }
    this.expect("op", ")");
    return args;
  }

  // ---- expressions, lowest precedence first ----

  private expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let left = this.and();
    while (this.isWord("or")) {
      const pos = this.next().pos;
      left = { kind: "binary", op: "or", left, right: this.and(), pos };
    }
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.isWord("and")) {
      const pos = this.next().pos;
      left = { kind: "binary", op: "and", left, right: this.not(), pos };
    }
    return left;
  }

  private not(): Expr {
    if (this.isWord("not")) {
      const pos = this.next().pos;
      return { kind: "unary", op: "not", operand: this.not(), pos };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const left = this.additive();
    const t = this.peek();
    if (t.kind === "op" && ["<", ">", "=", "==", "!=", "<=", ">="].includes(t.value)) {
      this.next();
      const op = (t.value === "==" ? "=" : t.value) as BinaryOp;
      const right = this.additive();
      if (this.peek().kind === "op" && ["<", ">", "=", "==", "!=", "<=", ">="].includes(this.peek().value)) {
        throw this.error("comparisons cannot be chained, use 'and'");
      }
      return { kind: "binary", op, left, right, pos: t.pos };
    }
    return left;
  }

  private additive(): Expr {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const t = this.next();
      left = { kind: "binary", op: t.value as BinaryOp, left, right: this.multiplicative(), pos: t.pos };
    }
    return left;
  }

  private multiplicative(): Expr {
    let left = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const t = this.next();
      left = { kind: "binary", op: t.value as BinaryOp, left, right: this.unary(), pos: t.pos };
    }
    return left;
  }

  private unary(): Expr {
    if (this.isOp("-")) {
      const pos = this.next().pos;
      const operand = this.unary();
      if (operand.kind === "number") {
        const value = operand.value.startsWith("-") ? operand.value.slice(1) : "-" + operand.value;
        return { kind: "number", value, pos };
      }
      return { kind: "unary", op: "-", operand, pos };
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.next();
    switch (t.kind) {
      case "number":
        return { kind: "number", value: t.value, pos: t.pos };
      case "string":
        return { kind: "string", value: t.value, pos: t.pos };
      case "op":
        if (t.value === "(") {
          const e = this.expr();
          this.expect("op", ")");
          return e;
        }
        break;
      case "ident": {
        if (t.value === "true" || t.value === "false") return { kind: "bool", value: t.value === "true", pos: t.pos };
        if (RESERVED.has(t.value)) break;
        if (this.isOp("(")) return { kind: "call", callee: t.value, args: this.args(), pos: t.pos };
        if (this.isOp("[")) {
          this.next();
          const index = this.expr();
          this.expect("op", "]");
          return { kind: "index", list: t.value, index, pos: t.pos };
        }
        if (this.isOp(".")) {
          this.next();
          const member = this.expect("ident", undefined, "a list property or method").value;
          return { kind: "member", object: t.value, member, args: this.isOp("(") ? this.args() : null, pos: t.pos };
        }
        return { kind: "name", name: t.value, pos: t.pos };
      }
    }
    throw this.error(`expected an expression, found ${describe(t)}`, t.pos);
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case "eof":
      return "end of file";
    case "newline":
      return "end of line";
    case "indent":
      return "an indented block";
    case "dedent":
      return "end of block";
    case "string":
      return `string "${t.value}"`;
    default:
      return `'${t.value}'`;
  }
}

import { PseudoError, type SourcePos } from "./errors.js";

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "op"
  | "newline"
  | "indent"
  | "dedent"
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  pos: SourcePos;
}

// Longest operators first so "+=" wins over "+".
const OPERATORS = [
  "+=", "-=", "*=", "/=", "==", "!=", "<=", ">=", "->",
  "+", "-", "*", "/", "%", "<", ">", "=", "(", ")", "[", "]", ",", ":", ".",
];

/**
 * Splits pseudocode into tokens with Python-style INDENT/DEDENT tokens.
 * Newlines inside parentheses or brackets are ignored, so long calls can wrap.
 */
export function tokenize(source: string, file?: string): Token[] {
  const tokens: Token[] = [];
  const indents = [0];
  let depth = 0;
  const lines = source.split(/\r?\n/);

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li]!;
    const lineNo = li + 1;
    let i = 0;

    if (depth === 0) {
      while (i < text.length && (text[i] === " " || text[i] === "\t")) {
        if (text[i] === "\t") throw new PseudoError("tabs are not allowed for indentation, use spaces", { line: lineNo, col: i + 1 }, file);
        i++;
      }
      // Blank and comment-only lines do not affect indentation.
      if (i === text.length || text[i] === "#") continue;
      const pos = { line: lineNo, col: 1 };
      const top = indents[indents.length - 1]!;
      if (i > top) {
        indents.push(i);
        tokens.push({ kind: "indent", value: "", pos });
      } else {
        while (i < indents[indents.length - 1]!) {
          indents.pop();
          tokens.push({ kind: "dedent", value: "", pos });
        }
        if (i !== indents[indents.length - 1]) {
          throw new PseudoError("indentation does not match any outer block", { line: lineNo, col: i + 1 }, file);
        }
      }
    }

    while (i < text.length) {
      const ch = text[i]!;
      const pos = { line: lineNo, col: i + 1 };
      if (ch === " " || ch === "\t") {
        i++;
      } else if (ch === "#") {
        break;
      } else if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1;
        while (j < text.length && /[A-Za-z0-9_]/.test(text[j]!)) j++;
        tokens.push({ kind: "ident", value: text.slice(i, j), pos });
        i = j;
      } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
        const m = /^(?:0x[0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i))!;
        tokens.push({ kind: "number", value: m[0], pos });
        i += m[0].length;
      } else if (ch === '"') {
        let j = i + 1;
        let value = "";
        while (j < text.length && text[j] !== '"') {
          if (text[j] === "\\") {
            const esc = text[j + 1];
            if (esc === "n") value += "\n";
            else if (esc === "t") value += "\t";
            else if (esc === '"' || esc === "\\") value += esc;
            else throw new PseudoError(`unknown escape \\${esc ?? ""}`, { line: lineNo, col: j + 1 }, file);
            j += 2;
          } else {
            value += text[j];
            j++;
          }
        }
        if (j >= text.length) throw new PseudoError("unterminated string", pos, file);
        tokens.push({ kind: "string", value, pos });
        i = j + 1;
      } else {
        const op = OPERATORS.find((o) => text.startsWith(o, i));
        if (!op) throw new PseudoError(`unexpected character '${ch}'`, pos, file);
        if (op === "(" || op === "[") depth++;
        if (op === ")" || op === "]") depth = Math.max(0, depth - 1);
        tokens.push({ kind: "op", value: op, pos });
        i += op.length;
      }
    }

    if (depth === 0) tokens.push({ kind: "newline", value: "", pos: { line: lineNo, col: text.length + 1 } });
  }

  const end = { line: lines.length + 1, col: 1 };
  while (indents.length > 1) {
    indents.pop();
    tokens.push({ kind: "dedent", value: "", pos: end });
  }
  tokens.push({ kind: "eof", value: "", pos: end });
  return tokens;
}

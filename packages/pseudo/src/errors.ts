export interface SourcePos {
  line: number; // 1-based
  col: number; // 1-based
}

/** An error tied to a location in a pseudocode file. `format()` renders it with a caret. */
export class PseudoError extends Error {
  constructor(
    message: string,
    readonly pos: SourcePos,
    readonly file = "<input>",
  ) {
    super(message);
    this.name = "PseudoError";
  }

  format(source?: string): string {
    const head = `${this.file}:${this.pos.line}:${this.pos.col}: error: ${this.message}`;
    const line = source?.split(/\r?\n/)[this.pos.line - 1];
    if (line === undefined) return head;
    return `${head}\n  ${line}\n  ${" ".repeat(Math.max(0, this.pos.col - 1))}^`;
  }
}

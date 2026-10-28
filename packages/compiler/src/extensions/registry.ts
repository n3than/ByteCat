import type { ReporterHandler, StatementHandler } from "../types.js";
import type { BlockSpec, Extension, HatSpec, MenuSpec, ReporterSpec, StatementSpec } from "./api.js";

/**
 * The extensions a compile can use, with every opcode looked up in one place. The code generator,
 * the yield analysis and the docs all read the specs through a registry, so a third-party
 * extension plugs in exactly like a built-in one.
 */
export class ExtensionRegistry {
  private readonly byId = new Map<string, Extension>();
  private readonly specs = new Map<string, { extension: Extension; spec: BlockSpec }>();
  /** Handlers of the statements that compile, by opcode. */
  readonly statements: Readonly<Record<string, StatementHandler>>;
  /** Handlers of the reporters (round and boolean) that compile, by opcode. */
  readonly reporters: Readonly<Record<string, ReporterHandler>>;

  constructor(readonly extensions: readonly Extension[]) {
    const statements: Record<string, StatementHandler> = {};
    const reporters: Record<string, ReporterHandler> = {};
    const problems: string[] = [];
    for (const extension of extensions) {
      if (this.byId.has(extension.id)) problems.push(`extension ${extension.id} is registered twice`);
      this.byId.set(extension.id, extension);
      problems.push(...checkExtension(extension));
      for (const [opcode, spec] of Object.entries(extension.blocks)) {
        if (this.specs.has(opcode)) problems.push(`${opcode} is declared by both ${this.specs.get(opcode)!.extension.id} and ${extension.id}`);
        this.specs.set(opcode, { extension, spec });
        if (spec.kind === "statement" && spec.compile) statements[opcode] = spec.compile;
        if ((spec.kind === "reporter" || spec.kind === "boolean") && spec.compile) reporters[opcode] = spec.compile;
      }
    }
    if (problems.length > 0) throw new Error(`invalid extensions:\n  ${problems.join("\n  ")}`);
    this.statements = statements;
    this.reporters = reporters;
  }

  /** A registry with these extensions added after the ones already here. */
  with(extra: readonly Extension[]): ExtensionRegistry {
    return extra.length === 0 ? this : new ExtensionRegistry([...this.extensions, ...extra]);
  }

  /** True when an extension with this id is registered. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  spec(opcode: string): BlockSpec | undefined {
    return this.specs.get(opcode)?.spec;
  }

  /** The extension that declares an opcode. */
  extensionOf(opcode: string): Extension | undefined {
    return this.specs.get(opcode)?.extension;
  }

  statement(opcode: string): StatementSpec | undefined {
    const spec = this.spec(opcode);
    return spec?.kind === "statement" ? spec : undefined;
  }

  reporter(opcode: string): ReporterSpec | undefined {
    const spec = this.spec(opcode);
    return spec?.kind === "reporter" || spec?.kind === "boolean" ? spec : undefined;
  }

  hat(opcode: string): HatSpec | undefined {
    const spec = this.spec(opcode);
    return spec?.kind === "hat" ? spec : undefined;
  }

  menu(opcode: string): MenuSpec | undefined {
    const spec = this.spec(opcode);
    return spec?.kind === "menu" ? spec : undefined;
  }
}

/** True when the code generator can compile a block of this spec. */
export function compiles(spec: BlockSpec): boolean {
  switch (spec.kind) {
    case "statement":
    case "reporter":
    case "boolean":
      return spec.compile !== undefined;
    case "hat":
      // No scheduler checks an edge-activated hat's predicate yet, so such a hat cannot compile.
      return spec.definesProcedure === true || (spec.event !== undefined && !spec.edgeActivated);
    case "menu":
      return true;
  }
}

/**
 * What is wrong with an extension: opcodes outside its prefix, and statuses that disagree with
 * the specs (a missing block that compiles, a compiled or partial one that does not, a partial or
 * missing one without a note saying why, a hat the runtime starts without a restart rule).
 */
export function checkExtension(extension: Extension): string[] {
  const problems: string[] = [];
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(extension.id)) problems.push(`extension id "${extension.id}" must be letters and digits`);
  for (const [opcode, spec] of Object.entries(extension.blocks)) {
    if (!opcode.startsWith(`${extension.id}_`)) problems.push(`${opcode} does not start with ${extension.id}_`);
    const ok = compiles(spec);
    if (spec.status === "missing" && ok) problems.push(`${opcode} is marked missing but compiles`);
    if (spec.status !== "missing" && !ok) problems.push(`${opcode} is marked ${spec.status} but does not compile`);
    if (spec.status !== "compiled" && !spec.note) problems.push(`${opcode} is ${spec.status} without a note`);
    if (spec.kind === "hat" && spec.event !== undefined && spec.restartExistingThreads === undefined) {
      problems.push(`${opcode} has no restartExistingThreads rule`);
    }
    if (spec.kind === "statement" && spec.yields === "loop" && !spec.substacks?.length) problems.push(`${opcode} is a loop without a substack`);
  }
  return problems;
}

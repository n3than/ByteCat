import type { HatKind } from "@bytecat/runtime";
import type { Block } from "@bytecat/sb3";
import type { YieldContext } from "../analysis/yields.js";
import type { ReporterHandler, StatementHandler } from "../types.js";

/**
 * The extension API. Every block category is an extension: Scratch's built-in categories
 * (`motion`, `looks`, `event`, ...), the extensions a project lists in project.json (`pen`,
 * `music`, ...) and third-party ones passed to `compileProject`. An extension declares each opcode
 * it knows, how to compile it, and how far that matches TurboWarp. See docs/extensions.md.
 */
export interface Extension {
  /**
   * The id: Scratch's opcode prefix (`motion` for `motion_movesteps`) and, for a non-core
   * extension, the id project.json lists under `extensions`. Every opcode starts with `${id}_`.
   */
  readonly id: string;
  /** Name for docs/blocks.md, as the Scratch palette shows it. */
  readonly name: string;
  /**
   * The module that exports the runtime functions this extension's blocks call (`uses`), so a
   * program can import only what it needs. Default `@bytecat/runtime`.
   */
  readonly runtime?: string;
  /** Every opcode the extension knows, compiled or not. */
  readonly blocks: Readonly<Record<string, BlockSpec>>;
}

/** How far Bytecat implements an opcode, compared with TurboWarp. */
export type Status = "compiled" | "partial" | "missing";

export type BlockKind = BlockSpec["kind"];

interface SpecBase {
  /**
   * `compiled`: matches TurboWarp. `partial`: compiled, but differs from TurboWarp in a case real
   * projects reach (`note` says which). `missing`: not compiled, so it is reported as unsupported
   * (`note` says what it needs). A registry refuses a status that disagrees with the rest of the
   * spec, such as a handler on a missing block.
   */
  readonly status: Status;
  /** What is partial or missing; shown in docs/blocks.md. */
  readonly note?: string;
  /** Not in the default palette: Scratch 2 leftovers and TurboWarp-only blocks. */
  readonly hidden?: boolean;
  /**
   * The runtime functions the generated code calls (`move` for `rt.move`, the `itemOf` helper,
   * ...), by name, from the extension's `runtime` module. The casts (`toNum`, `toStr`, `toBool`)
   * and the loop yield (`spin`) are always there and not listed.
   */
  readonly uses?: readonly string[];
}

/**
 * How a statement can yield; `analysis/yields.ts` reads nothing else. `wait`: it can wait for a
 * later frame whatever it is given. `loop`: a loop, which yields at the end of each iteration
 * unless the script is in warp mode, and whose body keeps the variables it uses in locals. A
 * function answers for blocks that depend on the project, such as a call to a custom block.
 */
export type Yields = "wait" | "loop" | ((b: Block, ctx: YieldContext) => boolean);

export interface StatementSpec extends SpecBase {
  readonly kind: "statement";
  readonly compile?: StatementHandler;
  /** Never yields when left out. The handler must agree (`Gen.y`, `loopYield`, `markYields`). */
  readonly yields?: Yields;
  /** The substack inputs the statement runs, which the yield analysis follows. */
  readonly substacks?: readonly string[];
}

export interface ReporterSpec extends SpecBase {
  /** `boolean` for a hexagonal (boolean) reporter, `reporter` for a round one. */
  readonly kind: "reporter" | "boolean";
  readonly compile?: ReporterHandler;
}

export interface HatSpec extends SpecBase {
  readonly kind: "hat";
  /**
   * TurboWarp's `restartExistingThreads` (its `getHats`): true when starting the hat again while
   * its script runs restarts the script, false when the running script goes on and the new start
   * is dropped. Set on every hat TurboWarp declares; a test compares it with TurboWarp's.
   */
  readonly restartExistingThreads?: boolean;
  /**
   * TurboWarp's `edgeActivated`: the hat is a condition (`when timer > 10`) that the runtime
   * checks every frame, starting the script when it turns from false to true. Such a hat stays
   * missing until the scheduler checks predicates (Phase 4.5 of the block coverage plan).
   */
  readonly edgeActivated?: boolean;
  /** The runtime event that starts the script (`Hat.kind` in @bytecat/runtime); left out while missing. */
  readonly event?: HatKind;
  /**
   * The field the event is matched against, ignoring case, like TurboWarp's `optMatchFields`:
   * `BROADCAST_OPTION` for a broadcast name, `KEY_OPTION` for a key. Its value becomes `Hat.arg`.
   */
  readonly matchField?: string;
  /**
   * For an edge-activated hat: the condition, compiled from the hat block's own inputs, which the
   * code generator will emit next to the script once the scheduler checks it. No hat has one yet.
   */
  readonly predicate?: ReporterHandler;
  /** Set on `procedures_definition`: the script under it is a custom block's body, not a hat script. */
  readonly definesProcedure?: true;
}

/** A shadow menu (costume, sprite, key, ...): a block whose one field holds the chosen value. */
export interface MenuSpec extends SpecBase {
  readonly kind: "menu";
  /** The field that holds the value. */
  readonly field: string;
}

export type BlockSpec = StatementSpec | ReporterSpec | HatSpec | MenuSpec;

// ---- helpers that keep extension files short ----

type Options<S> = Omit<S, "kind" | "compile" | "status"> & {
  /** Makes the block `partial`, with this note (instead of `note`). */
  partial?: string;
};

function status(partial: string | undefined): { status: Status; note?: string } {
  return partial === undefined ? { status: "compiled" } : { status: "partial", note: partial };
}

/** A compiled statement. */
export function statement(compile: StatementHandler, options: Options<StatementSpec> = {}): StatementSpec {
  const { partial, ...rest } = options;
  return { kind: "statement", compile, ...status(partial), ...rest };
}

/** A compiled reporter. */
export function reporter(compile: ReporterHandler, options: Options<ReporterSpec> = {}): ReporterSpec {
  const { partial, ...rest } = options;
  return { kind: "reporter", compile, ...status(partial), ...rest };
}

/** A compiled boolean reporter. */
export function boolean(compile: ReporterHandler, options: Options<ReporterSpec> = {}): ReporterSpec {
  const { partial, ...rest } = options;
  return { kind: "boolean", compile, ...status(partial), ...rest };
}

/** A hat the runtime starts on `event`. */
export function hat(
  event: HatKind,
  options: Omit<Options<HatSpec>, "event"> & { restartExistingThreads: boolean },
): HatSpec {
  const { partial, ...rest } = options;
  return { kind: "hat", event, ...status(partial), ...rest };
}

/** A shadow menu whose value is in `field`. */
export function menu(field: string, options: { hidden?: boolean } = {}): MenuSpec {
  return { kind: "menu", field, status: "compiled", ...options };
}

/** An opcode the extension knows but does not compile yet; `note` says what it needs. */
export function missing(
  kind: "statement" | "reporter" | "boolean",
  note: string,
  options: { hidden?: boolean } = {},
): BlockSpec {
  return { kind, status: "missing", note, ...options };
}

/** A hat the runtime cannot start yet, with TurboWarp's metadata for it. */
export function missingHat(
  meta: { restartExistingThreads: boolean; edgeActivated?: boolean },
  note: string,
  options: { hidden?: boolean } = {},
): HatSpec {
  return { kind: "hat", status: "missing", ...meta, note, ...options };
}

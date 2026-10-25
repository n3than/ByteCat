import type { ReporterHandler, StatementHandler } from "../types.js";
import { controlStatements } from "./control.js";
import { dataReporters, dataStatements } from "./data.js";
import { eventStatements } from "./events.js";
import { looksReporters, looksStatements } from "./looks.js";
import { motionReporters, motionStatements } from "./motion.js";
import { operatorReporters } from "./operators.js";
import { procedureReporters, procedureStatements } from "./procedures.js";
import { sensingReporters, sensingStatements } from "./sensing.js";

/** Statement handlers by opcode. Each category lives in its own file. */
export const statements: Record<string, StatementHandler> = {
  ...motionStatements,
  ...looksStatements,
  ...eventStatements,
  ...controlStatements,
  ...sensingStatements,
  ...dataStatements,
  ...procedureStatements,
};

/** Reporter handlers by opcode. */
export const reporters: Record<string, ReporterHandler> = {
  ...operatorReporters,
  ...motionReporters,
  ...looksReporters,
  ...sensingReporters,
  ...dataReporters,
  ...procedureReporters,
};

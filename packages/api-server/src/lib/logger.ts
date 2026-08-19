import pino from "pino";
import { LOG_LEVEL, IS_PRODUCTION } from "./env";

export const logger = pino({
  level: LOG_LEVEL,
  transport: !IS_PRODUCTION ? { target: "pino-pretty" } : undefined,
});

const pino = require('pino') as typeof import('pino');

/**
 * Single shared pino instance used by every structured-JSON log emission
 * path in this codebase (LoggingInterceptor's success/error paths and
 * LoggingExceptionFilter's guard-rejection backstop). Keeping ONE instance
 * (rather than each caller instantiating its own) avoids drift in log
 * formatting/timestamp behavior between emission paths.
 */
export const structuredLogger = pino({
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Structured logging via pino. NDJSON in production/test, pretty-printed in
// dev. Level from LOG_LEVEL (default info). See issue #30.
import { pino } from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const env = process.env.NODE_ENV || 'development';

// In production and test, write NDJSON to process.stdout (a stream pino calls
// via stdout.write, which tests can spy on). In dev, pretty-print.
export const logger =
  env === 'development'
    ? pino({ level, transport: { target: 'pino-pretty' } })
    : pino({ level }, process.stdout);

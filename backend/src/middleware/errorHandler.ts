// Global Express error middleware — the safety net for errors that fall
// through asyncHandler's next(err) path and body-parse failures. Per-route
// try/catches remain the primary handlers. See issue #30.
import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../services/DomainError.js';

const statusByCode: Record<string, number> = {
  SESSION_NOT_FOUND: 404,
  SESSION_FULL: 403,
  NO_RESTAURANTS_FOUND: 400,
  VALIDATION_ERROR: 400,
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response {
  if (err instanceof DomainError) {
    return res.status(statusByCode[err.code] ?? 400).json({
      error: err.code,
      code: err.code,
      message: err.message,
    });
  }

  // express.json() throws SyntaxError with a status for malformed bodies
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    return res.status(400).json({
      error: 'Bad Request',
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON',
    });
  }

  console.error('Unhandled request error:', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

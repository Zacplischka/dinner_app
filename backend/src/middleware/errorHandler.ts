// Global Express error middleware for errors forwarded by asyncHandler and
// body-parse failures. All shaping runs through the single transport mapping in
// toApiError; the wire body is always exactly { code, message }.
import type { NextFunction, Request, Response } from 'express';
import { toApiError } from '../api/toApiError.js';
import { logger } from '../logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response {
  const { status, body } = toApiError(err);

  // Server faults (including anything that mapped to INTERNAL_ERROR) get logged
  // with the real error; the client only ever sees the detail-free body.
  if (status >= 500) {
    (req.log ?? logger).error({ err }, 'Unhandled request error');
  }

  return res.status(status).json(body);
}

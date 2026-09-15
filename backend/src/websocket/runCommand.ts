// The transport every socket command shares: validate the payload, run the
// handler's act, and turn any failure into one public ApiError ack.

import type { z } from 'zod';
import type { Ack } from '@dinder/shared/types';
import { logger } from '../logger.js';
import { DomainError } from '../services/DomainError.js';
import { toApiError } from '../api/toApiError.js';

/**
 * A bad payload or a DomainError is an expected outcome and warns; anything
 * else is a handler bug and logs at error. `act` acknowledges its own success,
 * which keeps each handler's ack-before-broadcast ordering.
 */
export async function runCommand<P extends { sessionCode: string }, T>(
  event: string,
  socketId: string,
  schema: z.ZodType<P>,
  payload: unknown,
  callback: (response: Ack<T>) => void,
  act: (data: P, ack: (data: T) => void) => Promise<void>
): Promise<void> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const reason = parsed.error.issues[0].message;
    const sessionCode = (payload as Partial<P> | null)?.sessionCode;
    logger.warn({ socketId, sessionCode, reason }, `Rejected ${event}`);
    return callback({ success: false, error: { code: 'VALIDATION_ERROR', message: reason } });
  }
  try {
    await act(parsed.data, (data) => callback({ success: true, data }));
  } catch (error) {
    if (error instanceof DomainError) {
      const { sessionCode } = parsed.data;
      logger.warn({ socketId, sessionCode, reason: error.code }, `Rejected ${event}`);
    } else {
      logger.error({ err: error, socketId }, `Error in ${event} handler`);
    }
    callback({ success: false, error: toApiError(error).body });
  }
}

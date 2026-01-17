// WebSocket error handler
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ErrorEvent,
} from '@dinder/shared/types';

/**
 * Emit structured error event to client
 */
export function emitError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const errorEvent: ErrorEvent = {
    code,
    message,
    details,
  };

  socket.emit('error', errorEvent);
  console.error(`[Error ${socket.id}] ${code}: ${message}`);
}

/**
 * Error code constants
 */
export const ErrorCodes = {
  SESSION_FULL: 'SESSION_FULL',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IN_SESSION: 'NOT_IN_SESSION',
} as const;
// WebSocket handler for session:restart event - pure transport over
// SessionService.restartSession (payload validation, ack/broadcasts).
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import { toApiError } from '../api/toApiError.js';
import {
  SESSION_CODE_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionRestartPayload,
  type SessionRestartResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionRestartPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
});

export async function handleSessionRestart(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionRestartPayload,
  callback: (response: SessionRestartResponse) => void,
  service: SessionService
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionRestartPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn(
        {
          socketId: socket.id,
          sessionCode: (payload as Partial<SessionRestartPayload>).sessionCode,
          reason,
        },
        'Rejected session:restart'
      );
      return callback({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: reason },
      });
    }

    const { sessionCode } = validation.data;

    try {
      await service.restartSession(sessionCode, socket.id);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
      logger.warn(
        {
          socketId: socket.id,
          sessionCode,
          reason: error.code,
        },
        'Rejected session:restart'
      );
      return callback({ success: false, error: toApiError(error).body });
    }

    // Send acknowledgment. No-data command → canonical data is null.
    callback({ success: true, data: null });

    // Broadcast to ALL participants (including sender - FR-013)
    io.in(sessionCode).emit('session:restarted', {
      sessionCode,
      message: 'Session restarted. Make new selections.',
    });
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in session:restart handler');
    callback({ success: false, error: toApiError(error).body });
  }
}

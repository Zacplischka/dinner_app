// WebSocket handler for session:leave event - pure transport over
// SessionService.leaveSession (payload validation, ack/broadcasts).
// Leaving is deliberate (unlike disconnect, which preserves the participant).

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
  type SessionLeavePayload,
  type SessionLeaveResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionLeavePayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
});

export async function handleSessionLeave(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionLeavePayload,
  callback: (response: SessionLeaveResponse) => void,
  service: SessionService
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionLeavePayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn(
        {
          socketId: socket.id,
          sessionCode: (payload as Partial<SessionLeavePayload>).sessionCode,
          reason,
        },
        'Rejected session:leave'
      );
      return callback({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: reason },
      });
    }

    const { sessionCode } = validation.data;

    let displayName: string;
    let participantCount: number;
    let results: Awaited<ReturnType<SessionService['leaveSession']>>['results'];
    try {
      ({ displayName, participantCount, results } = await service.leaveSession(
        sessionCode,
        socket.id
      ));
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
        'Rejected session:leave'
      );
      return callback({ success: false, error: toApiError(error).body });
    }

    // Leave Socket.IO room
    await socket.leave(sessionCode);

    // Send acknowledgment to leaving client. No-data command → canonical data is null.
    callback({ success: true, data: null });

    // Broadcast to remaining participants
    socket.to(sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName,
      participantCount,
    });

    // Leaving completed the session for those remaining: broadcast the Match
    if (results) {
      io.in(sessionCode).emit('session:results', {
        sessionCode,
        ...results,
      });
    }
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in session:leave handler');
    callback({ success: false, error: toApiError(error).body });
  }
}

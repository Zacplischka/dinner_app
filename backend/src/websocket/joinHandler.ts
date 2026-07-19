// WebSocket handler for session:join event - pure transport over
// SessionService.joinSession (payload validation, room join, ack/broadcast).
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import { MAX_PARTICIPANTS, type SessionService } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import { toApiError } from '../api/toApiError.js';
import {
  SESSION_CODE_LENGTH,
  SESSION_CODE_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionJoinPayload,
  type SessionJoinResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionJoinPayloadSchema = z.object({
  sessionCode: z
    .string()
    .regex(
      SESSION_CODE_PATTERN,
      `Session code must be ${SESSION_CODE_LENGTH} alphanumeric characters`
    ),
  displayName: z.string().min(1, 'Display name required').max(50, 'Display name too long'),
});

const joinErrorMessages: Record<string, string> = {
  SESSION_NOT_FOUND: 'Session not found or has expired',
  SESSION_FULL: `Session is full (maximum ${MAX_PARTICIPANTS} participants)`,
};

export async function handleSessionJoin(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionJoinPayload,
  callback: (response: SessionJoinResponse) => void,
  service: SessionService
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionJoinPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn(
        {
          socketId: socket.id,
          sessionCode: (payload as Partial<SessionJoinPayload>).sessionCode,
          reason,
        },
        'Rejected session:join'
      );
      return callback({
        success: false,
        error: 'Invalid payload: ' + reason,
        // ponytail: canonical error alongside legacy string, remove after #116.
        apiError: { code: 'VALIDATION_ERROR', message: reason },
      });
    }

    const { sessionCode, displayName } = validation.data;

    const result = await service.joinSession(sessionCode, socket.id, displayName);

    // Join Socket.IO room
    await socket.join(sessionCode);

    // Send acknowledgment to joining client
    const data = {
      participantId: socket.id,
      sessionCode,
      displayName,
      participantCount: result.participantCount,
      participants: result.participants,
    };
    callback({
      success: true,
      // Canonical success payload (bridge).
      data,
      // ponytail: legacy flattened fields, duplicated by `data`, remove after #116.
      ...data,
    });

    // Broadcast to OTHER participants in room (FR-022)
    socket.to(sessionCode).emit('participant:joined', {
      participantId: socket.id,
      displayName,
      participantCount: result.participantCount,
      isRejoin: result.isRejoin,
    });

    logger.info(
      {
        socketId: socket.id,
        sessionCode,
        isRejoin: result.isRejoin,
        participantCount: result.participantCount,
      },
      'Participant joined session'
    );
  } catch (error) {
    if (error instanceof DomainError && joinErrorMessages[error.code]) {
      return callback({
        success: false,
        error: joinErrorMessages[error.code],
        // ponytail: canonical error alongside legacy string, remove after #116.
        apiError: toApiError(error).body,
      });
    }
    logger.error({ err: error, socketId: socket.id }, 'Error in session:join handler');
    callback({
      success: false,
      error: 'An error occurred while joining the session',
      // ponytail: canonical error alongside legacy string, remove after #116.
      apiError: toApiError(error).body,
    });
  }
}

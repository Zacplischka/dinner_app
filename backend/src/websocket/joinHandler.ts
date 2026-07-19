// WebSocket handler for session:join event - pure transport over
// SessionService.joinSession (payload validation, room join, ack/broadcast).
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
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

// Domain rejections that are expected transport outcomes, not handler bugs -
// they ack a public error without an error-level log.
const EXPECTED_JOIN_ERRORS = ['SESSION_NOT_FOUND', 'SESSION_FULL'];

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
        error: { code: 'VALIDATION_ERROR', message: reason },
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
    callback({ success: true, data });

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
    if (error instanceof DomainError && EXPECTED_JOIN_ERRORS.includes(error.code)) {
      return callback({ success: false, error: toApiError(error).body });
    }
    logger.error({ err: error, socketId: socket.id }, 'Error in session:join handler');
    callback({ success: false, error: toApiError(error).body });
  }
}

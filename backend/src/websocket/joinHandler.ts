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
  rejoinToken: z.string().uuid().optional(),
});

// Domain rejections that are expected transport outcomes, not handler bugs -
// they ack a public error without an error-level log.
const EXPECTED_JOIN_ERRORS = [
  'SESSION_NOT_FOUND',
  'SESSION_FULL',
  'DISPLAY_NAME_TAKEN',
  'SESSION_ALREADY_STARTED',
];

/** The old-Session departure a join commits, success or not (#284). */
type LeftSession = NonNullable<Awaited<ReturnType<SessionService['joinSession']>>['leftSession']>;

export async function handleSessionJoin(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionJoinPayload,
  callback: (response: SessionJoinResponse) => void,
  service: SessionService
): Promise<void> {
  // Joining pulled them out of another Session (#284): tell that room they
  // left, and deliver the Match when their departure completed it.
  const emitDeparture = (left: LeftSession) => {
    socket.to(left.sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName: left.displayName,
      participantCount: left.participantCount,
    });
    if (left.results) {
      socket.to(left.sessionCode).emit('session:results', {
        sessionCode: left.sessionCode,
        ...left.results,
      });
    }
  };

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

    const { sessionCode, displayName, rejoinToken } = validation.data;

    const result = await service.joinSession(sessionCode, socket.id, displayName, rejoinToken);

    // A socket carries at most one Session: leave any other Session's room,
    // or its broadcasts keep reaching this client as phantom Participants
    // (#283). socket.rooms always holds the socket's own id room — keep it.
    for (const room of [...socket.rooms]) {
      if (room !== socket.id && room !== sessionCode) {
        await socket.leave(room);
      }
    }

    // Join Socket.IO room
    await socket.join(sessionCode);

    // Send acknowledgment to joining client
    const data = {
      participantId: socket.id,
      sessionCode,
      displayName,
      participantCount: result.participantCount,
      rejoinToken: result.rejoinToken,
      participants: result.participants,
      branch: result.branch,
      state: result.state,
    };
    callback({ success: true, data });

    // Broadcast to OTHER participants in room (FR-022)
    socket.to(sessionCode).emit('participant:joined', {
      participantId: socket.id,
      displayName,
      sessionCode,
      participantCount: result.participantCount,
      isRejoin: result.isRejoin,
    });

    if (result.leftSession) emitDeparture(result.leftSession);

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
    // The post-add re-checks can refuse the join AFTER the old-Session
    // departure committed to Redis — the old room must still hear it, or a
    // Session that departure completed sits on a Match nobody is ever sent.
    const left = (error as { leftSession?: LeftSession }).leftSession;
    if (left) emitDeparture(left);

    if (error instanceof DomainError && EXPECTED_JOIN_ERRORS.includes(error.code)) {
      return callback({ success: false, error: toApiError(error).body });
    }
    logger.error({ err: error, socketId: socket.id }, 'Error in session:join handler');
    callback({ success: false, error: toApiError(error).body });
  }
}

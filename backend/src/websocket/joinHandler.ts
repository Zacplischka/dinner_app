// WebSocket handler for session:join event - pure transport over
// SessionService.joinSession (payload validation, room join, ack/broadcast).
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket } from 'socket.io';
import { z } from 'zod';
import * as SessionService from '../services/SessionService.js';
import { MAX_PARTICIPANTS } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionJoinPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/, 'Session code must be 6 alphanumeric characters'),
  displayName: z.string().min(1, 'Display name required').max(50, 'Display name too long'),
});

const joinErrorMessages: Record<string, string> = {
  SESSION_NOT_FOUND: 'Session not found or has expired',
  SESSION_FULL: `Session is full (maximum ${MAX_PARTICIPANTS} participants)`,
};

export async function handleSessionJoin(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionJoinPayload,
  callback: (response: SessionJoinResponse) => void
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionJoinPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      console.warn('Rejected session:join', {
        socketId: socket.id,
        sessionCode: (payload as Partial<SessionJoinPayload>).sessionCode,
        reason,
      });
      return callback({
        success: false,
        error: 'Invalid payload: ' + reason,
      });
    }

    const { sessionCode, displayName } = validation.data;

    const result = await SessionService.joinSession(sessionCode, socket.id, displayName);

    // Join Socket.IO room
    await socket.join(sessionCode);

    // Send acknowledgment to joining client
    callback({
      success: true,
      participantId: socket.id,
      sessionCode,
      displayName,
      participantCount: result.participantCount,
      participants: result.participants,
    });

    // Broadcast to OTHER participants in room (FR-022)
    socket.to(sessionCode).emit('participant:joined', {
      participantId: socket.id,
      displayName,
      participantCount: result.participantCount,
    });

    console.log(
      `✓ ${displayName} ${result.isRejoin ? 'rejoined' : 'joined'} session ${sessionCode} (${result.participantCount}/${MAX_PARTICIPANTS})`
    );
  } catch (error) {
    if (error instanceof DomainError && joinErrorMessages[error.code]) {
      return callback({
        success: false,
        error: joinErrorMessages[error.code],
      });
    }
    console.error('Error in session:join handler:', error);
    callback({
      success: false,
      error: 'An error occurred while joining the session',
    });
  }
}

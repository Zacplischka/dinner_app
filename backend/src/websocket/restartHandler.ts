// WebSocket handler for session:restart event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionStore } from '../store/sessionStore.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionRestartPayload,
  SessionRestartResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionRestartPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
});

export async function handleSessionRestart(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionRestartPayload,
  callback: (response: SessionRestartResponse) => void,
  store: SessionStore
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionRestartPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn({
        socketId: socket.id,
        sessionCode: (payload as Partial<SessionRestartPayload>).sessionCode,
        reason,
      }, 'Rejected session:restart');
      return callback({
        success: false,
        error: 'Invalid payload: ' + reason,
      });
    }

    const { sessionCode } = validation.data;

    // Check session exists
    const session = await store.readSession(sessionCode);
    if (!session) {
      logger.warn({
        socketId: socket.id,
        sessionCode,
        reason: 'session_not_found',
      }, 'Rejected session:restart');
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Check participant is in session
    const isInSession = await store.isParticipant(sessionCode, socket.id);
    if (!isInSession) {
      logger.warn({
        socketId: socket.id,
        sessionCode,
        reason: 'participant_not_in_session',
      }, 'Rejected session:restart');
      return callback({
        success: false,
        error: 'You are not a participant in this session',
      });
    }

    // Restart: wipe Selections, Submissions, and the Match; back to 'selecting' (FR-012)
    await store.resetForRestart(sessionCode);

    // Send acknowledgment
    callback({ success: true });

    // Broadcast to ALL participants (including sender - FR-013)
    io.in(sessionCode).emit('session:restarted', {
      sessionCode,
      message: 'Session restarted. Make new selections.',
    });

    logger.info({ socketId: socket.id, sessionCode }, 'Session restarted');
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in session:restart handler');
    callback({
      success: false,
      error: 'An error occurred while restarting the session',
    });
  }
}

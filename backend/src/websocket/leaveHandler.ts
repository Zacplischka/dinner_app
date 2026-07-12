// WebSocket handler for session:leave event
// Handles intentional session departure (different from disconnect which preserves participant)

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionStore } from '../store/sessionStore.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionLeavePayload,
  SessionLeaveResponse,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionLeavePayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
});

export async function handleSessionLeave(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  _io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionLeavePayload,
  callback: (response: SessionLeaveResponse) => void,
  store: SessionStore
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionLeavePayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn({
        socketId: socket.id,
        sessionCode: (payload as Partial<SessionLeavePayload>).sessionCode,
        reason,
      }, 'Rejected session:leave');
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
      }, 'Rejected session:leave');
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Get participant info before removal
    const participant = await store.getParticipant(socket.id);
    if (!participant) {
      logger.warn({
        socketId: socket.id,
        sessionCode,
        reason: 'participant_not_found',
      }, 'Rejected session:leave');
      return callback({
        success: false,
        error: 'You are not a participant in this session',
      });
    }

    const { displayName } = participant;

    // Remove participant from session (unlike disconnect, this actually removes)
    const newCount = await store.removeParticipant(sessionCode, socket.id);

    // Leave Socket.IO room
    await socket.leave(sessionCode);

    // Send acknowledgment to leaving client
    callback({ success: true });

    // Broadcast to remaining participants
    socket.to(sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName,
      participantCount: newCount,
    });

    logger.info({ socketId: socket.id, sessionCode, participantCount: newCount }, 'Participant left session');
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in session:leave handler');
    callback({
      success: false,
      error: 'An error occurred while leaving the session',
    });
  }
}

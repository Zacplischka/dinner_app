// WebSocket disconnect handler
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import type { SessionStore } from '../store/sessionStore.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dinder/shared/types';

/**
 * Handle socket disconnect
 * Note: Per FR-025, participant is NOT removed from session
 * Session stays in waiting state until reconnect or expire
 */
export async function handleDisconnect(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  _io: Server<ClientToServerEvents, ServerToClientEvents>,
  reason: string,
  store: SessionStore
): Promise<void> {
  try {
    logger.info({ socketId: socket.id, reason }, 'Socket disconnected');

    // Get participant info to find which session they were in
    const participant = await store.getParticipant(socket.id);

    if (!participant) {
      // Participant not found or not in any session
      logger.warn({
        socketId: socket.id,
        reason,
      }, 'Disconnected socket had no participant record');
      return;
    }

    const { sessionCode, displayName } = participant;

    // Get current participant count (unchanged, per FR-025)
    const participantCount = await store.countParticipants(sessionCode);

    // Broadcast participant:disconnected to remaining participants
    // This is INFORMATIONAL only - participant remains in session per FR-025
    // Different from participant:left which is for intentional departures
    socket.to(sessionCode).emit('participant:disconnected', {
      participantId: socket.id,
      displayName,
      participantCount, // Count unchanged - participant still in session
    });

    logger.info({ socketId: socket.id, sessionCode }, 'Participant disconnected, session preserved');

    // Note: We do NOT call ParticipantModel.removeParticipant
    // The participant remains in the session and can reconnect
    // The session will expire after 30 minutes of inactivity (FR-019)
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in disconnect handler');
  }
}

// WebSocket disconnect handler

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import type { SessionStore } from '../store/sessionStore.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinder/shared/types';

/**
 * Handle socket disconnect
 * Note: the participant is NOT removed from the session — they may reconnect.
 * Only their presence flag flips, so a later joiner sees them offline.
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
      logger.warn(
        {
          socketId: socket.id,
          reason,
        },
        'Disconnected socket had no participant record'
      );
      return;
    }

    const { sessionCode, displayName } = participant;

    // Server truth for presence: still a current Participant, but anyone who
    // joins or rejoins from here on sees them offline instead of live.
    await store.markDisconnected(socket.id);

    // Get current participant count (unchanged — a disconnect removes nobody)
    const participantCount = await store.countParticipants(sessionCode);

    // Broadcast participant:disconnected to remaining participants
    // This is INFORMATIONAL only - the participant remains in the session
    // Different from participant:left which is for intentional departures
    socket.to(sessionCode).emit('participant:disconnected', {
      participantId: socket.id,
      displayName,
      participantCount, // Count unchanged - participant still in session
    });

    logger.info(
      { socketId: socket.id, sessionCode },
      'Participant disconnected, session preserved'
    );

    // Note: We do NOT call the store's removeParticipant
    // The participant remains in the session and can reconnect
    // The session will expire after 30 minutes of inactivity
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in disconnect handler');
  }
}

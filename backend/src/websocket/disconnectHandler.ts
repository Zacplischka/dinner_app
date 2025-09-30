// WebSocket disconnect handler
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket, Server } from 'socket.io';
import * as ParticipantModel from '../models/Participant.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dinner-app/shared/types';

/**
 * Handle socket disconnect
 * Note: Per FR-025, participant is NOT removed from session
 * Session stays in waiting state until reconnect or expire
 */
export async function handleDisconnect(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  _io: Server<ClientToServerEvents, ServerToClientEvents>,
  reason: string
): Promise<void> {
  try {
    console.log(`Socket ${socket.id} disconnected: ${reason}`);

    // Get participant info to find which session they were in
    const participant = await ParticipantModel.getParticipant(socket.id);

    if (!participant) {
      // Participant not found or not in any session
      return;
    }

    const { sessionCode, displayName } = participant;

    // Get current participant count (unchanged, per FR-025)
    const participantCount = await ParticipantModel.countParticipants(sessionCode);

    // Broadcast participant:left to remaining participants
    // Note: Participant remains in session, this is just informational (FR-025)
    socket.to(sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName,
      participantCount, // Count unchanged - participant still in session
    });

    console.log(`✓ ${displayName} disconnected from ${sessionCode} (session preserved)`);

    // Note: We do NOT call ParticipantModel.removeParticipant
    // The participant remains in the session and can reconnect
    // The session will expire after 30 minutes of inactivity (FR-019)
  } catch (error: any) {
    console.error('Error in disconnect handler:', error);
  }
}
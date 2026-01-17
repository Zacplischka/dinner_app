// WebSocket handler for session:leave event
// Handles intentional session departure (different from disconnect which preserves participant)

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
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
  callback: (response: SessionLeaveResponse) => void
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionLeavePayloadSchema.safeParse(payload);
    if (!validation.success) {
      return callback({
        success: false,
        error: 'Invalid payload: ' + validation.error.errors[0].message,
      });
    }

    const { sessionCode } = validation.data;

    // Check session exists
    const session = await SessionModel.getSession(sessionCode);
    if (!session) {
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Get participant info before removal
    const participant = await ParticipantModel.getParticipant(socket.id);
    if (!participant) {
      return callback({
        success: false,
        error: 'You are not a participant in this session',
      });
    }

    const { displayName } = participant;

    // Remove participant from session (unlike disconnect, this actually removes)
    await ParticipantModel.removeParticipant(sessionCode, socket.id);

    // Get updated participant count
    const newCount = await ParticipantModel.countParticipants(sessionCode);

    // Leave Socket.IO room
    socket.leave(sessionCode);

    // Send acknowledgment to leaving client
    callback({ success: true });

    // Broadcast to remaining participants
    socket.to(sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName,
      participantCount: newCount,
    });

    console.log(`✓ ${displayName} left session ${sessionCode} (${newCount}/4 remaining)`);
  } catch (error) {
    console.error('Error in session:leave handler:', error);
    callback({
      success: false,
      error: 'An error occurred while leaving the session',
    });
  }
}

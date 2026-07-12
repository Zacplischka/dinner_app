// WebSocket handler for session:join event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket } from 'socket.io';
import { z } from 'zod';
import * as store from '../store/sessionStore.js';
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

    // Check session exists
    const session = await store.readSession(sessionCode);
    if (!session) {
      console.warn('Rejected session:join', {
        socketId: socket.id,
        sessionCode,
        reason: 'session_not_found',
      });
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Check if this is a rejoin (same displayName reconnecting with new socket ID)
    const existingParticipants = await store.listParticipants(sessionCode);
    const existingParticipant = existingParticipants.find(p => p.displayName === displayName);

    let isHost = false;
    let isRejoin = false;
    let newCount: number;

    if (existingParticipant) {
      // Rejoin: remove old entry and add new one with current socket.id
      isRejoin = true;
      isHost = existingParticipant.isHost;
      await store.removeParticipant(sessionCode, existingParticipant.participantId);
      newCount = await store.addParticipant(sessionCode, {
        participantId: socket.id,
        displayName,
        isHost,
      });
    } else {
      // New participant - check limit (FR-005)
      const currentCount = await store.countParticipants(sessionCode);
      if (currentCount >= 4) {
        console.warn('Rejected session:join', {
          socketId: socket.id,
          sessionCode,
          reason: 'session_full',
          participantCount: currentCount,
        });
        return callback({
          success: false,
          error: 'Session is full (maximum 4 participants)',
        });
      }

      // First participant becomes the host
      isHost = currentCount === 0;

      // Add participant using socket.id as participantId
      newCount = await store.addParticipant(sessionCode, {
        participantId: socket.id,
        displayName,
        isHost,
      });
    }

    // Re-check count after adding to catch race condition
    // ponytail: check-then-add race survives; a truly atomic join is the
    // unify-join-paths refactor's job
    if (newCount > 4) {
      // Rollback: remove the participant we just added
      await store.removeParticipant(sessionCode, socket.id);
      console.warn('Rejected session:join', {
        socketId: socket.id,
        sessionCode,
        reason: 'session_full_after_add',
        participantCount: newCount,
      });
      return callback({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
    }

    // Update participant count in session hash
    await store.setParticipantCount(sessionCode, newCount);

    // Join Socket.IO room
    await socket.join(sessionCode);

    // Get all participants for response
    const participants = await store.listParticipants(sessionCode);

    // Send acknowledgment to joining client
    callback({
      success: true,
      participantId: socket.id,
      sessionCode,
      displayName,
      participantCount: newCount,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        isHost: p.isHost,
      })),
    });

    // Broadcast to OTHER participants in room (FR-022)
    socket.to(sessionCode).emit('participant:joined', {
      participantId: socket.id,
      displayName,
      participantCount: newCount,
    });

    console.log(`✓ ${displayName} ${isRejoin ? 'rejoined' : 'joined'} session ${sessionCode} (${newCount}/4)`);
  } catch (error) {
    console.error('Error in session:join handler:', error);
    callback({
      success: false,
      error: 'An error occurred while joining the session',
    });
  }
}

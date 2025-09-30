// WebSocket handler for session:join event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket } from 'socket.io';
import { z } from 'zod';
// SessionService import removed as it's not used in this handler
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinResponse,
} from '@dinner-app/shared/types';

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
      return callback({
        success: false,
        error: 'Invalid payload: ' + validation.error.errors[0].message,
      });
    }

    const { sessionCode, displayName } = validation.data;

    // Check session exists
    const session = await SessionModel.getSession(sessionCode);
    if (!session) {
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Check participant limit (FR-005)
    // Use atomic operation to prevent race condition:
    // 1. Add participant first
    // 2. Re-check count after adding
    // 3. Rollback if over limit
    const currentCount = await ParticipantModel.countParticipants(sessionCode);
    if (currentCount >= 4) {
      return callback({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
    }

    // First participant becomes the host
    const isHost = currentCount === 0;

    // Add participant using socket.id as participantId
    await ParticipantModel.addParticipant(sessionCode, socket.id, displayName, isHost);

    // Re-check count after adding to catch race condition
    const newCount = await ParticipantModel.countParticipants(sessionCode);
    if (newCount > 4) {
      // Rollback: remove the participant we just added
      await ParticipantModel.removeParticipant(sessionCode, socket.id);
      return callback({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
    }

    // Update participant count in session hash
    await SessionModel.setParticipantCount(sessionCode, newCount);

    // Update last activity
    await SessionModel.updateLastActivity(sessionCode);

    // Join Socket.IO room
    await socket.join(sessionCode);

    // Refresh TTL on all session keys
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    await refreshSessionTtl(sessionCode, participantIds);

    // Get all participants for response
    const participants = await ParticipantModel.listParticipants(sessionCode);

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

    console.log(`✓ ${displayName} joined session ${sessionCode} (${newCount}/4)`);
  } catch (error: any) {
    console.error('Error in session:join handler:', error);
    callback({
      success: false,
      error: 'An error occurred while joining the session',
    });
  }
}
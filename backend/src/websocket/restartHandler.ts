// WebSocket handler for session:restart event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import * as SelectionService from '../services/SelectionService.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
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
  callback: (response: SessionRestartResponse) => void
): Promise<void> {
  try {
    // Validate payload
    const validation = sessionRestartPayloadSchema.safeParse(payload);
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

    // Check participant is in session
    const isInSession = await ParticipantModel.isParticipantInSession(
      sessionCode,
      socket.id
    );
    if (!isInSession) {
      return callback({
        success: false,
        error: 'You are not a participant in this session',
      });
    }

    // Clear all selections (FR-012)
    await SelectionService.clearSelections(sessionCode);

    // Reset hasSubmitted flag for all participants
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    const pipeline = redis.pipeline();
    participantIds.forEach((participantId) => {
      pipeline.hset(`participant:${participantId}`, 'hasSubmitted', '0');
    });
    await pipeline.exec();

    // Update session state back to selecting
    await SessionModel.updateSessionState(sessionCode, 'selecting');

    // Update last activity
    await SessionModel.updateLastActivity(sessionCode);

    // Refresh TTL
    await refreshSessionTtl(sessionCode, participantIds);

    // Send acknowledgment
    callback({ success: true });

    // Broadcast to ALL participants (including sender - FR-013)
    io.in(sessionCode).emit('session:restarted', {
      sessionCode,
      message: 'Session restarted. Make new selections.',
    });

    console.log(`✓ Session ${sessionCode} restarted`);
  } catch (error) {
    console.error('Error in session:restart handler:', error);
    callback({
      success: false,
      error: 'An error occurred while restarting the session',
    });
  }
}
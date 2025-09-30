// WebSocket handler for selection:submit event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import * as SelectionService from '../services/SelectionService.js';
import * as OverlapService from '../services/OverlapService.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SelectionSubmitPayload,
  SelectionSubmitResponse,
} from '@dinner-app/shared/types';

// Zod schema for validation
const selectionSubmitPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
  selections: z.array(z.string()).min(1, 'Must select at least 1 option').max(50),
});

export async function handleSelectionSubmit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SelectionSubmitPayload,
  callback: (response: SelectionSubmitResponse) => void
): Promise<void> {
  try {
    // Validate payload
    const validation = selectionSubmitPayloadSchema.safeParse(payload);
    if (!validation.success) {
      return callback({
        success: false,
        error: 'Invalid payload: ' + validation.error.errors[0].message,
      });
    }

    const { sessionCode, selections } = validation.data;

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

    // Submit selections (validates options and checks already submitted)
    try {
      await SelectionService.submitSelections(sessionCode, socket.id, selections);
    } catch (error) {
      return callback({
        success: false,
        error: error instanceof Error && error.message === 'INVALID_OPTIONS'
          ? 'One or more selected options are invalid'
          : error instanceof Error && error.message === 'ALREADY_SUBMITTED'
          ? 'You have already submitted your selections'
          : 'Error submitting selections',
      });
    }

    // Mark participant as submitted
    await ParticipantModel.markParticipantSubmitted(socket.id);

    // Update last activity
    await SessionModel.updateLastActivity(sessionCode);

    // Refresh TTL
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    await refreshSessionTtl(sessionCode, participantIds);

    // Send acknowledgment
    callback({ success: true });

    // Get submission count
    const submittedCount = await SelectionService.getSubmittedCount(sessionCode);
    const participantCount = participantIds.length;

    // Broadcast participant:submitted (count only, not selections - FR-023)
    socket.to(sessionCode).emit('participant:submitted', {
      participantId: socket.id,
      submittedCount,
      participantCount,
    });

    console.log(`✓ Participant ${socket.id} submitted (${submittedCount}/${participantCount})`);

    // Check if all submitted
    const allSubmitted = submittedCount === participantCount;

    if (allSubmitted) {
      // Calculate overlap
      const results = await OverlapService.calculateOverlap(sessionCode);

      // Store results
      await OverlapService.storeResults(
        sessionCode,
        results.overlappingOptions.map((opt) => opt.optionId)
      );

      // Refresh TTL after storing results to ensure results key expires with session
      await refreshSessionTtl(sessionCode, participantIds);

      // Update session state
      await SessionModel.updateSessionState(sessionCode, 'complete');

      // Broadcast results to ALL participants (including sender)
      io.in(sessionCode).emit('session:results', {
        sessionCode,
        overlappingOptions: results.overlappingOptions,
        allSelections: results.allSelections,
        hasOverlap: results.hasOverlap,
      });

      console.log(
        `✓ Session ${sessionCode} complete - ${results.hasOverlap ? 'Match found!' : 'No overlap'}`
      );
    }
  } catch (error) {
    console.error('Error in selection:submit handler:', error);
    callback({
      success: false,
      error: 'An error occurred while submitting selections',
    });
  }
}
// WebSocket handler for selection:submit event
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionStore } from '../store/sessionStore.js';
import { DomainError } from '../services/DomainError.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SelectionSubmitPayload,
  SelectionSubmitResponse,
} from '@dinder/shared/types';

// Zod schema for validation
// Note: We allow 0 selections - a user may not like any options, and that's valid.
// The overlap calculation will handle empty selections gracefully.
const selectionSubmitPayloadSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
  selections: z.array(z.string()).max(50),
});

export async function handleSelectionSubmit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SelectionSubmitPayload,
  callback: (response: SelectionSubmitResponse) => void,
  store: SessionStore
): Promise<void> {
  try {
    // Validate payload
    const validation = selectionSubmitPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      console.warn('Rejected selection:submit', {
        socketId: socket.id,
        sessionCode: (payload as Partial<SelectionSubmitPayload>).sessionCode,
        reason,
      });
      return callback({
        success: false,
        error: 'Invalid payload: ' + reason,
      });
    }

    const { sessionCode, selections } = validation.data;

    // Check session exists
    const session = await store.readSession(sessionCode);
    if (!session) {
      console.warn('Rejected selection:submit', {
        socketId: socket.id,
        sessionCode,
        reason: 'session_not_found',
      });
      return callback({
        success: false,
        error: 'Session not found or has expired',
      });
    }

    // Check participant is in session
    const isInSession = await store.isParticipant(sessionCode, socket.id);
    if (!isInSession) {
      console.warn('Rejected selection:submit', {
        socketId: socket.id,
        sessionCode,
        reason: 'participant_not_in_session',
      });
      return callback({
        success: false,
        error: 'You are not a participant in this session',
      });
    }

    // Record the Submission (validates restaurants, rejects duplicates,
    // stores selections, marks submitted, touches TTL)
    let submittedCount: number;
    let participantCount: number;
    try {
      ({ submittedCount, participantCount } = await store.recordSubmission(
        sessionCode,
        socket.id,
        selections
      ));
    } catch (error) {
      console.warn('Rejected selection:submit', {
        socketId: socket.id,
        sessionCode,
        reason:
          error instanceof DomainError
            ? error.code
            : error instanceof Error
              ? error.message
              : 'unknown_error',
      });
      return callback({
        success: false,
        // DomainError messages are the user-facing copy
        error: error instanceof DomainError ? error.message : 'Error submitting selections',
      });
    }

    // Send acknowledgment
    callback({ success: true });

    // Broadcast participant:submitted to ALL participants (count only, not selections - FR-023)
    io.in(sessionCode).emit('participant:submitted', {
      participantId: socket.id,
      submittedCount,
      participantCount,
    });

    console.log(`✓ Participant ${socket.id} submitted (${submittedCount}/${participantCount})`);

    // Check if all submitted
    if (submittedCount === participantCount) {
      // Compute and store the Match
      const results = await store.computeAndStoreResults(sessionCode);

      // Update session state
      await store.updateState(sessionCode, 'complete');

      // Broadcast results to ALL participants (including sender)
      io.in(sessionCode).emit('session:results', {
        sessionCode,
        overlappingOptions: results.overlappingOptions,
        allSelections: results.allSelections,
        restaurantNames: results.restaurantNames,
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

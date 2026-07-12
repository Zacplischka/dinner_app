// WebSocket handler for selection:submit event - pure transport over
// SessionService.submitSelections (payload validation, ack/broadcasts).
// Based on: specs/001-dinner-decider-enables/contracts/websocket-events.md

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
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
  service: SessionService
): Promise<void> {
  try {
    // Validate payload
    const validation = selectionSubmitPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn({
        socketId: socket.id,
        sessionCode: (payload as Partial<SelectionSubmitPayload>).sessionCode,
        reason,
      }, 'Rejected selection:submit');
      return callback({
        success: false,
        error: 'Invalid payload: ' + reason,
      });
    }

    const { sessionCode, selections } = validation.data;

    let submittedCount: number;
    let participantCount: number;
    let results: Awaited<ReturnType<SessionService['submitSelections']>>['results'];
    try {
      ({ submittedCount, participantCount, results } = await service.submitSelections(
        sessionCode,
        socket.id,
        selections
      ));
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
      logger.warn({
        socketId: socket.id,
        sessionCode,
        reason: error.code,
      }, 'Rejected selection:submit');
      return callback({
        success: false,
        // DomainError messages are the user-facing copy
        error: error.message,
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

    logger.info({ socketId: socket.id, sessionCode, submittedCount, participantCount }, 'Participant submitted selections');

    // When everyone has submitted, the service returns the computed Match
    if (results) {
      // Broadcast results to ALL participants (including sender)
      io.in(sessionCode).emit('session:results', {
        sessionCode,
        overlappingOptions: results.overlappingOptions,
        allSelections: results.allSelections,
        restaurantNames: results.restaurantNames,
        hasOverlap: results.hasOverlap,
      });
    }
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in selection:submit handler');
    callback({
      success: false,
      error: 'An error occurred while submitting selections',
    });
  }
}

// WebSocket handler for selection:submit event - pure transport over
// SessionService.submitSelections (payload validation, ack/broadcasts).

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { runCommand } from './runCommand.js';
import {
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SelectionSubmitPayload,
} from '@dinder/shared/types';

// Zod schema for validation
// Note: We allow 0 selections - a user may not like any options, and that's valid.
// The overlap calculation will handle empty selections gracefully.
const selectionSubmitPayloadSchema = z.object({
  round: z.number().int().nonnegative().optional(),
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  selections: z.array(z.string()).max(50),
});

export async function handleSelectionSubmit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SelectionSubmitPayload,
  callback: (response: Ack<null>) => void,
  service: SessionService
): Promise<void> {
  await runCommand(
    'selection:submit',
    socket.id,
    selectionSubmitPayloadSchema,
    payload,
    callback,
    async ({ sessionCode, selections, round }, ack) => {
      const { submittedCount, participantCount, results } = await service.submitSelections(
        sessionCode,
        socket.id,
        selections,
        round
      );

      // Send acknowledgment. No-data command → canonical data is null.
      ack(null);

      // Broadcast participant:submitted to ALL participants — count only, never
      // the selections themselves, which stay private until everyone submits.
      io.in(sessionCode).emit('participant:submitted', {
        participantId: socket.id,
        submittedCount,
        participantCount,
      });

      const lobby = await service.getLobby(sessionCode);
      if (lobby) io.in(sessionCode).emit('session:lobby', lobby);

      logger.info(
        { socketId: socket.id, sessionCode, submittedCount, participantCount },
        'Participant submitted selections'
      );

      // When everyone has submitted, the service returns the computed Match:
      // broadcast it to ALL participants (including sender)
      if (results) io.in(sessionCode).emit('session:results', { sessionCode, ...results });
    }
  );
}

// WebSocket handler for session:leave event - pure transport over
// SessionService.leaveSession (payload validation, ack/broadcasts).
// Leaving is deliberate (unlike disconnect, which preserves the participant).

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { runCommand } from './runCommand.js';
import {
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionLeavePayload,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionLeavePayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
});

export async function handleSessionLeave(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionLeavePayload,
  callback: (response: Ack<null>) => void,
  service: SessionService
): Promise<void> {
  await runCommand(
    'session:leave',
    socket.id,
    sessionLeavePayloadSchema,
    payload,
    callback,
    async ({ sessionCode }, ack) => {
      const { displayName, participantCount, results } = await service.leaveSession(
        sessionCode,
        socket.id
      );

      // Leave Socket.IO room
      await socket.leave(sessionCode);

      // Send acknowledgment to leaving client. No-data command → canonical data is null.
      ack(null);

      // Broadcast to remaining participants
      socket.to(sessionCode).emit('participant:left', {
        participantId: socket.id,
        displayName,
        participantCount,
      });

      const lobby = await service.getLobby(sessionCode);
      if (lobby) io.in(sessionCode).emit('session:lobby', lobby);

      // Leaving completed the session for those remaining: broadcast the Match
      if (results) io.in(sessionCode).emit('session:results', { sessionCode, ...results });
    }
  );
}

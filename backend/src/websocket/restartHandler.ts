// WebSocket handler for session:restart event - pure transport over
// SessionService.restartSession (payload validation, ack/broadcasts).

import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { runCommand } from './runCommand.js';
import {
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionRestartPayload,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionRestartPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
});

export async function handleSessionRestart(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionRestartPayload,
  callback: (response: Ack<null>) => void,
  service: SessionService
): Promise<void> {
  await runCommand(
    'session:restart',
    socket.id,
    sessionRestartPayloadSchema,
    payload,
    callback,
    async ({ sessionCode }, ack) => {
      const { restarted } = await service.restartSession(sessionCode, socket.id);

      // Send acknowledgment. No-data command → canonical data is null.
      ack(null);

      // Broadcast to ALL participants (including sender). The lobby's
      // start rides the same event; only the message says which it was (#289).
      const lobby = await service.getLobby(sessionCode);
      io.in(sessionCode).emit('session:restarted', {
        ...(lobby ? { state: 'waiting' as const, lobby } : {}),
        sessionCode,
        message: lobby
          ? 'Back in the lobby. Review your choices and confirm Ready.'
          : restarted
            ? 'Session restarted. Make new selections.'
            : 'Selection started.',
      });
    }
  );
}

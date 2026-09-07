import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionLobbyState,
} from '@dinder/shared/types';
import type { SessionService } from '../services/SessionService.js';
import { choicesPayloadSchema, lobbyPayloadSchema } from '../api/lobbySchema.js';
import { toApiError } from '../api/toApiError.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  service: SessionService
): void {
  async function run<T extends { sessionCode: string }>(
    schema: z.ZodType<T>,
    payload: unknown,
    callback: (response: Ack<SessionLobbyState>) => void,
    action: (data: T) => Promise<SessionLobbyState>
  ) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      callback({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message },
      });
      return;
    }
    try {
      const lobby = await action(parsed.data);
      callback({ success: true, data: lobby });
      io.in(lobby.sessionCode).emit('session:lobby', lobby);
    } catch (error) {
      callback({ success: false, error: toApiError(error).body });
      // A failed deal leaves its explanation and editable choices in the Lobby.
      const lobby = await service.getLobby(parsed.data.sessionCode);
      if (lobby) io.in(lobby.sessionCode).emit('session:lobby', lobby);
    }
  }
  socket.on('session:choices', (payload, callback) => {
    void run(choicesPayloadSchema, payload, callback, (data) =>
      service.updateChoices(data.sessionCode, socket.id, data)
    );
  });
  socket.on('session:ready', (payload, callback) => {
    void run(lobbyPayloadSchema.extend({ ready: z.boolean() }), payload, callback, (data) =>
      service.setReady(data.sessionCode, socket.id, data.revision, data.ready)
    );
  });
  socket.on('session:start', (payload, callback) => {
    void run(lobbyPayloadSchema, payload, callback, (data) =>
      service.startRound(data.sessionCode, socket.id, data.revision)
    );
  });
  socket.on('session:remove', (payload, callback) => {
    void run(
      lobbyPayloadSchema.extend({ participantId: z.string().min(1).max(200) }),
      payload,
      callback,
      (data) => service.removeAbsent(data.sessionCode, socket.id, data.revision, data.participantId)
    );
  });
}

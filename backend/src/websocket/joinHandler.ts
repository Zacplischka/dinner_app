// WebSocket handler for session:join event - pure transport over
// SessionService.joinSession (payload validation, room join, ack/broadcast).

import { logger } from '../logger.js';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { SessionService } from '../services/SessionService.js';
import { runCommand } from './runCommand.js';
import {
  MAX_DISPLAY_NAME_LENGTH,
  SESSION_CODE_LENGTH,
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionJoinData,
  type SessionJoinPayload,
} from '@dinder/shared/types';

// Zod schema for validation
const sessionJoinPayloadSchema = z.object({
  sessionCode: z
    .string()
    .regex(
      SESSION_CODE_PATTERN,
      `Session code must be ${SESSION_CODE_LENGTH} alphanumeric characters`
    ),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name required')
    .max(MAX_DISPLAY_NAME_LENGTH, 'Display name too long'),
  rejoinToken: z.string().uuid().optional(),
  accessToken: z.string().min(1).max(8192).optional(),
});

/** The old-Session departure a join commits, success or not (#284). */
type LeftSession = NonNullable<Awaited<ReturnType<SessionService['joinSession']>>['leftSession']>;

export async function handleSessionJoin(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SessionJoinPayload,
  callback: (response: Ack<SessionJoinData>) => void,
  service: SessionService,
  resolveAvatar: (token?: string) => Promise<string | null> = () => Promise.resolve(null)
): Promise<void> {
  // Joining pulled them out of another Session (#284): tell that room they
  // left, and deliver the Match when their departure completed it — or else
  // re-send its Lobby, whose revision and roster the departure changed (#529).
  const emitDeparture = (left: LeftSession) => {
    socket.to(left.sessionCode).emit('participant:left', {
      participantId: socket.id,
      displayName: left.displayName,
      participantCount: left.participantCount,
    });
    if (left.results) {
      socket.to(left.sessionCode).emit('session:results', {
        sessionCode: left.sessionCode,
        ...left.results,
      });
    } else {
      service
        .getLobby(left.sessionCode)
        .then((lobby) => lobby && socket.to(left.sessionCode).emit('session:lobby', lobby))
        .catch((err: unknown) =>
          logger.warn(
            { err, socketId: socket.id, sessionCode: left.sessionCode },
            'Departed Lobby re-broadcast failed'
          )
        );
    }
  };

  await runCommand(
    'session:join',
    socket.id,
    sessionJoinPayloadSchema,
    payload,
    callback,
    async ({ sessionCode, displayName, rejoinToken, accessToken }, ack) => {
      const avatarUrl = await resolveAvatar(accessToken);
      const result = await service
        .joinSession(sessionCode, socket.id, displayName, rejoinToken, avatarUrl)
        .catch((error: unknown) => {
          // The post-add re-checks can refuse the join AFTER the old-Session
          // departure committed to Redis — the old room must still hear it, or a
          // Session that departure completed sits on a Match nobody is ever sent.
          const left = (error as { leftSession?: LeftSession }).leftSession;
          if (left) emitDeparture(left);
          throw error;
        });

      // A socket carries at most one Session: leave any other Session's room,
      // or its broadcasts keep reaching this client as phantom Participants
      // (#283). socket.rooms always holds the socket's own id room — keep it.
      for (const room of [...socket.rooms]) {
        if (room !== socket.id && room !== sessionCode) {
          await socket.leave(room);
        }
      }

      // Join Socket.IO room
      await socket.join(sessionCode);

      // Send acknowledgment to joining client
      ack({
        participantId: socket.id,
        sessionCode,
        displayName,
        participantCount: result.participantCount,
        rejoinToken: result.rejoinToken,
        participants: result.participants,
        branch: result.branch,
        state: result.state,
        lobby: result.lobby,
        results: result.results,
      });

      // Broadcast to OTHER participants in room (the joiner got the ack)
      socket.to(sessionCode).emit('participant:joined', {
        participantId: socket.id,
        displayName,
        sessionCode,
        participantCount: result.participantCount,
        isRejoin: result.isRejoin,
        // The room's copy of who the Host is, or a Host who rejoins reads as an
        // ordinary Participant on every other client and the start guard fires
        // for all of them (#405).
        isHost: result.isHost,
        avatarUrl,
      });

      if (result.lobby) socket.to(sessionCode).emit('session:lobby', result.lobby);

      if (result.leftSession) emitDeparture(result.leftSession);

      logger.info(
        {
          socketId: socket.id,
          sessionCode,
          isRejoin: result.isRejoin,
          participantCount: result.participantCount,
        },
        'Participant joined session'
      );
    }
  );
}

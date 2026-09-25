// WebSocket handler for selection:live - a fire-and-forget re-broadcast of a
// mid-deck Live Selection, or of an Undo taking one back (#410).
// Pure transport: no persistence, either way.
// removeParticipant DELs session:{code}:{pid}:selections and joinSession calls
// removeParticipant on every rejoin (SessionService.ts), so any mid-deck write
// here would be silently destroyed by a reconnect.

import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { SessionStore } from '../store/sessionStore.js';
import { DomainError } from '../services/DomainError.js';
import { runCommand } from './runCommand.js';
import {
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SelectionLivePayload,
} from '@dinder/shared/types';

const selectionLivePayloadSchema = z.object({
  round: z.number().int().nonnegative().optional(),
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  placeId: z.string().min(1),
  // An Undo taking a Live Selection back (#410). Same command, same membership
  // check, same fire-and-forget re-broadcast — only the flag rides along.
  retract: z.boolean().optional(),
});

export async function handleLiveSelection(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SelectionLivePayload,
  callback: (response: Ack<null>) => void,
  store: SessionStore
): Promise<void> {
  await runCommand(
    'selection:live',
    socket.id,
    selectionLivePayloadSchema,
    payload,
    callback,
    async ({ sessionCode, placeId, retract, round }, ack) => {
      // One HGETALL both proves membership and yields displayName — the same
      // check SessionService.leaveSession makes. No second read.
      const participant = await store.getParticipant(socket.id);
      if (!participant || participant.sessionCode !== sessionCode) {
        throw new DomainError('NOT_IN_SESSION', 'You are not a participant in this session');
      }

      const session = await store.readSession(sessionCode);
      if (
        participant.waitingForNextRound ||
        (session &&
          (session.state !== 'selecting' ||
            (round !== undefined && round !== session.lobby?.round)))
      ) {
        throw new DomainError('NOT_IN_SESSION', 'You are waiting for the next round.');
      }

      ack(null);

      // ponytail: swiping does not refresh the 30-min TTL — 20 cards is ~2 min and
      // join/submit both touch. Ceiling: a deck long enough to outlive the TTL.
      // Upgrade: call the store's touch() here (it is private today; export it) or
      // debounce one touch per participant per deck.

      // ponytail: unvalidated placeId; the receiver only reveals ids present in its
      // own deck, so a junk id is inert. Upgrade: SISMEMBER session:{code}:restaurant_ids
      // if abuse appears.

      // Sender excluded, matching participant:joined (joinHandler.ts) — a client
      // counts its own like from its local `selections`, never from this event.
      socket.to(sessionCode).emit('participant:selected', {
        participantId: socket.id,
        displayName: participant.displayName,
        placeId,
        retract,
      });
    }
  );
}

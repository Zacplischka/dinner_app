// WebSocket handler for selection:live - a fire-and-forget re-broadcast of a
// mid-deck Live Selection. Pure transport: no persistence (see live-swipe-room.md).
// removeParticipant DELs session:{code}:{pid}:selections and joinSession calls
// removeParticipant on every rejoin (SessionService.ts), so any mid-deck write
// here would be silently destroyed by a reconnect.

import { logger } from '../logger.js';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { SessionStore } from '../store/sessionStore.js';
import { toApiError } from '../api/toApiError.js';
import {
  SESSION_CODE_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SelectionLivePayload,
  type SelectionLiveResponse,
} from '@dinder/shared/types';

const selectionLivePayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  placeId: z.string().min(1),
});

export async function handleLiveSelection(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: SelectionLivePayload,
  callback: (response: SelectionLiveResponse) => void,
  store: SessionStore
): Promise<void> {
  try {
    const validation = selectionLivePayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn({ socketId: socket.id, reason }, 'Rejected selection:live');
      return callback({ success: false, error: { code: 'VALIDATION_ERROR', message: reason } });
    }

    const { sessionCode, placeId } = validation.data;

    // One HGETALL both proves membership and yields displayName — the same
    // check leaveSession makes (SessionService.ts:477-479). No second read.
    const participant = await store.getParticipant(socket.id);
    if (!participant || participant.sessionCode !== sessionCode) {
      return callback({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: 'You are not a participant in this session' },
      });
    }

    callback({ success: true, data: null });

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
    });
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in selection:live handler');
    callback({ success: false, error: toApiError(error).body });
  }
}

// Frontend-owned local state shapes for a live Session (issue #113).
// These mirror what the frontend builds from WebSocket events; they are not
// wire contracts and are not shared with the backend, whose Redis persistence
// shapes live in backend/src/store/sessionStore.ts.

// The screens after the Match — Compare, the delivery links, the Group Order —
// are the restaurant ending, and the Shopping List is the Cook ending, so they
// narrow on these. The guards ship with the type (a shared/ rule) so both
// sides classify a Deck Entry alike.
export { isMovie, isRecipe, isRestaurant } from '@dinder/shared/types';

export interface Participant {
  participantId: string;
  displayName: string;
  avatarUrl?: string | null;
  sessionCode: string;
  hasSubmitted: boolean;
  isHost: boolean;
  /**
   * Presence. undefined = online. Seeded from the join ack's roster (server
   * truth), then kept current by participant:disconnected / participant:joined.
   */
  isOnline?: boolean;
  ready?: boolean;
  waitingForNextRound?: boolean;
}

// Who may run the room's shared commands (the Lobby's start, a Restart): the
// Host, or — when no Host is actually here (left, or dropped) — whoever is,
// since nothing promotes a successor and the server lets them rather than
// strand the room (#405).
export function isEffectiveHost(
  participants: Participant[],
  currentUserId: string | null
): boolean {
  const me = participants.find((p) => p.participantId === currentUserId);
  return !!me && (me.isHost || !participants.some((p) => p.isHost && p.isOnline !== false));
}

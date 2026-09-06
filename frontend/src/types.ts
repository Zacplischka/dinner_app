// Frontend-owned local state shapes for a live Session (issue #113).
// These mirror what the frontend builds from WebSocket events; they are not
// wire contracts and are not shared with the backend, whose Redis persistence
// shapes live in backend/src/store/sessionStore.ts.

import type { SessionResultsEvent } from '@dinder/shared/types';

// The screens after the Match — Compare, the delivery links, the Group Order —
// are the restaurant ending, and the Shopping List is the Cook ending, so they
// narrow on these. The guards ship with the type (a shared/ rule) so both
// sides classify a Deck Entry alike.
export { isMovie, isRecipe, isRestaurant } from '@dinder/shared/types';

export interface Participant {
  participantId: string;
  displayName: string;
  sessionCode: string;
  hasSubmitted: boolean;
  isHost: boolean;
  /**
   * Presence. undefined = online. Seeded from the join ack's roster (server
   * truth), then kept current by participant:disconnected / participant:joined.
   */
  isOnline?: boolean;
}

/** The Match as the store holds it: exactly what session:results delivered. */
export type Result = SessionResultsEvent;

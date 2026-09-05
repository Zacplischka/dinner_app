// Frontend-owned local state shapes for a live Session (issue #113).
// These mirror what the frontend builds from WebSocket events; they are not
// wire contracts and are not shared with the backend, whose Redis persistence
// shapes live in backend/src/store/sessionStore.ts.

import type { DeckEntry } from '@dinder/shared/types';

// The screens after the Match — Compare, the delivery links, the Group Order —
// are the restaurant ending, and the Shopping List is the Cook ending, so they
// narrow on these. The guards ship with the type (shared/CLAUDE.md) so both
// sides classify a Deck Entry alike.
export { isMovie, isRecipe, isRestaurant } from '@dinder/shared/types';

export interface Participant {
  participantId: string;
  displayName: string;
  sessionCode: string;
  joinedAt: number;
  hasSubmitted: boolean;
  isHost: boolean;
  /** Client-only presence. undefined = online; only ever set false by participant:disconnected. */
  isOnline?: boolean;
}

export interface Result {
  sessionCode: string;
  overlappingOptions: DeckEntry[];
  allSelections: Record<string, string[]>; // displayName -> placeIds
  restaurantNames?: Record<string, string>; // placeId -> name mapping for display
  hasOverlap: boolean;
  topPick?: { restaurant: DeckEntry; likedBy: number; of: number };
  /** The Shopping List a completed Cook Session minted (#262); absent elsewhere. */
  shoppingListId?: string;
}

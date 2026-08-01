// Frontend-owned local state shapes for a live Session (issue #113).
// These mirror what the frontend builds from WebSocket events; they are not
// wire contracts and are not shared with the backend, whose Redis persistence
// shapes live in backend/src/store/sessionStore.ts.

import type { DeckEntry, Restaurant } from '@dinder/shared/types';

/**
 * Narrows a Deck Entry to the Restaurant arm.
 *
 * ponytail: the screens after the Match are the restaurant ending — Compare,
 * the delivery links, the Group Order — so they narrow here instead of branching
 * on a Recipe design that does not exist yet. Ceiling: a Recipe reaching those
 * screens is filtered away silently, rendering as no Match and no crown. The
 * Cook Branch must route its own ending (#259, the Shopping List) rather than
 * reuse them; if it ever does reuse ResultsPage, this narrowing is what to
 * remove, and MatchCard is what has to learn a second card kind.
 */
export const isRestaurant = (entry: DeckEntry): entry is Restaurant => entry.kind !== 'recipe';

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
}

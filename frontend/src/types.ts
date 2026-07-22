// Frontend-owned local state shapes for a live Session (issue #113).
// These mirror what the frontend builds from WebSocket events; they are not
// wire contracts and are not shared with the backend, whose Redis persistence
// shapes live in backend/src/store/sessionStore.ts.

import type { Restaurant } from '@dinder/shared/types';

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
  overlappingOptions: Restaurant[];
  allSelections: Record<string, string[]>; // displayName -> placeIds
  restaurantNames?: Record<string, string>; // placeId -> name mapping for display
  hasOverlap: boolean;
  topPick?: { restaurant: Restaurant; likedBy: number; of: number };
}

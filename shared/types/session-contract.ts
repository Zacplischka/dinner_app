// Endpoint-specific wire contracts for the REST Session path (issue #105).
// These are the shared shapes the backend responds with and the frontend maps
// into local state — neither side reaches for the other's internal models.
// Geocoding has no contract here: its success body is already the shared
// GeocodedArea value (Phase 1A — no response DTO when the whole body is a
// stable shared value), and its request carries no body to validate.

import type { Craving } from './cook.js';
import type { Branch, DeckEntry } from './models.js';
import type { SessionLobbyState } from './session-lobby.js';
import type { Mood } from './watch.js';

/**
 * The Deck size a Host may ask for at setup (#415). 5-50 on the wire for every
 * Branch; Eat Out and Takeaway stop their stepper at MAX_RESTAURANT_DECK_SIZE
 * because one Places page is 20 results and a second page is a second
 * full-price Enterprise Text Search per Session (#97).
 */
export const MIN_DECK_SIZE = 5;
export const MAX_DECK_SIZE = 50;
export const MAX_RESTAURANT_DECK_SIZE = 20;
/** What a setup screen preselects, so an untouched form deals what it always did. */
export const DEFAULT_DECK_SIZE = 15;

export interface SessionLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

// POST /api/sessions
/** Public setup defaults; read before the Host chooses a Deck size. */
export interface SessionDefaultsResponse {
  cookDeckSize: number;
}

export interface CreateSessionRequest {
  hostName: string;
  collaborative?: boolean;
  location?: SessionLocation;
  searchRadiusMiles?: number;
  branch?: Branch;
  /** Cook setup: what the Deck is dealt from. Ignored outside the Cook Branch. */
  craving?: Craving;
  /** Cook setup: who's eating. Stored on the Session, never part of the Craving. */
  headcount?: number;
  /** Watch setup: what the Movie Deck is dealt from. Ignored outside the Watch Branch. */
  mood?: Mood;
  /**
   * How many cards the Host wants to swipe (#415), MIN_DECK_SIZE-MAX_DECK_SIZE.
   * Absent means the Branch's own default. A Deck never exceeds supply, so this
   * is a ceiling, not a promise.
   */
  deckSize?: number;
}

// GET /api/sessions/:sessionCode
export interface SessionResponse {
  lobby?: SessionLobbyState;
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
  branch?: Branch;
  /**
   * Cook Branch only (#333): this Session's Deck came up short because the
   * recipe source was dark when it was dealt. Absent on a full Deck — the
   * branch not darkening is the product — and absent on a thin Craving the
   * source answered honestly, which is a fact about the catalogue, not us.
   * Every Participant reads it here, so the line they see is one line.
   */
  recipeSourceDown?: boolean;
}

// POST /api/sessions response — a Session plus the host-supplied setup echoed back.
export interface CreateSessionResponse extends SessionResponse {
  location?: SessionLocation;
  searchRadiusMiles?: number;
  restaurantCount?: number;
  /** Echoed back so the Host sees the Headcount the Session froze. */
  headcount?: number;
}

// GET /api/options/:sessionCode — the Session's Deck. The field keeps its
// legacy `restaurants` name (ADR 0007) though it carries both Deck Entry
// kinds: Restaurants, and Recipes for a Cook Session.
export interface LoadRestaurantsResponse {
  sessionCode: string;
  restaurants: DeckEntry[];
}

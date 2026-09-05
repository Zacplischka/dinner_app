// Shared TypeScript types for data models

export const SESSION_CODE_LENGTH = 5;
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{5}$/;

/**
 * The kind of night a Session is for, picked at the entry fork and fixed for
 * the Session's life (#255). Carried additively in the create contract
 * (ADR 0007): a client that never sends one gets today's behavior.
 */
export const BRANCHES = ['eatout', 'takeaway', 'cook', 'watch'] as const;
export type Branch = (typeof BRANCHES)[number];

export interface Restaurant {
  /**
   * Which kind of Deck Entry this is. Optional and absent from every producer
   * that predates the Cook Branch, which is what makes the union additive
   * (ADR 0007): no `kind` reads as a Restaurant.
   */
  kind?: 'restaurant';
  placeId: string;
  name: string;
  rating?: number;
  priceLevel?: number; // 0-4 (0 = free); omitted when the source data doesn't know
  cuisineType?: string;
  address?: string;
  photoUrl?: string;
  openNow?: boolean;
}

/** A cookable dish a Cook-branch Session deals. Restaurant's counterpart. */
export interface Recipe {
  kind: 'recipe';
  placeId: string;
  /** The recipe title. */
  name: string;
  photoUrl?: string;
  /**
   * Spoonacular aggregate likes. The Top Pick's middle rung for a Recipe,
   * standing in for a Restaurant's rating.
   */
  aggregateLikes?: number;
}

/** A film a Watch-branch Session deals (#369). Restaurant's counterpart. */
export interface Movie {
  kind: 'movie';
  /** The movie source's id. */
  placeId: string;
  /** The movie title. */
  name: string;
  /** Poster. */
  photoUrl?: string;
  /**
   * The Top Pick's middle rung for a Movie: a critics score on one 0–100
   * scale — the Rotten Tomatoes Tomatometer %, else Metacritic's Metascore.
   * Not a Restaurant's 0-5 — a Deck never mixes kinds, so the rung only ever
   * compares Movie with Movie. Absent when the source has neither.
   */
  rating?: number;
  year?: number;
  genres?: string[];
  runtimeMinutes?: number;
  overview?: string;
  trailerUrl?: string;
}

/**
 * One entry of a Deck — the Restaurant, Recipe or Movie a Participant swipes on
 * (see CONTEXT.md). The whole Selection path (deal, swipe, Live Selection,
 * Match, Top Pick) keys on `placeId`, which is a Google place id for a
 * Restaurant and the source's id for a Recipe or Movie; it keeps its original
 * name because every wire shape, Redis key, and store field already speaks it
 * (ADR 0007).
 */
export type DeckEntry = Restaurant | Recipe | Movie;

/**
 * Narrows a Deck Entry to the Restaurant arm. No `kind` reads as a Restaurant
 * (every pre-Cook producer), so this is the one place that rule is spelled out
 * — a `!== 'recipe'` check would misfile every later kind as a Restaurant.
 */
export const isRestaurant = (entry: DeckEntry): entry is Restaurant =>
  entry.kind === undefined || entry.kind === 'restaurant';

/**
 * Narrows a Deck Entry to the Recipe arm. The Cook ending narrows on this, not
 * on `!isRestaurant` — every later kind passes that test too.
 */
export const isRecipe = (entry: DeckEntry): entry is Recipe => entry.kind === 'recipe';

export interface Venue {
  placeId: string;
  name: string;
  rating?: number;
  cuisineType?: string;
  address?: string;
  photoUrl?: string;
  distanceMiles: number;
}

export interface GeocodedArea {
  latitude: number;
  longitude: number;
  area?: string;
}

// The ephemeral Session, its Participants, Selections, and the Match live only
// as long as their Redis keys do. They are NOT wire contracts: the backend owns
// its persistence shapes (backend/src/store/sessionStore.ts) and the frontend
// owns its local state shapes (frontend/src/types.ts). See issue #113.

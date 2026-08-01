// Shared TypeScript types for data models
// Based on: specs/001-dinner-decider-enables/data-model.md

export const SESSION_CODE_LENGTH = 5;
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{5}$/;

/**
 * The kind of night a Session is for, picked at the entry fork and fixed for
 * the Session's life (#255). Carried additively in the create contract
 * (ADR 0007): a client that never sends one gets today's behavior.
 */
export const BRANCHES = ['eatout', 'takeaway', 'cook'] as const;
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

/**
 * One entry of a Deck — the Restaurant or Recipe a Participant swipes on (see
 * CONTEXT.md). The whole Selection path (deal, swipe, Live Selection, Match,
 * Top Pick) keys on `placeId`, which is a Google place id for a Restaurant and
 * the recipe source's id for a Recipe; it keeps its original name because every
 * wire shape, Redis key, and store field already speaks it (ADR 0007).
 */
export type DeckEntry = Restaurant | Recipe;

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

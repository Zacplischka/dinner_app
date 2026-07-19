// Shared TypeScript types for data models
// Based on: specs/001-dinner-decider-enables/data-model.md

export const SESSION_CODE_LENGTH = 5;
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{5}$/;

export interface Restaurant {
  placeId: string;
  name: string;
  rating?: number;
  priceLevel?: number; // 0-4 (0 = free); omitted when the source data doesn't know
  cuisineType?: string;
  address?: string;
  photoUrl?: string;
  openNow?: boolean;
}

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

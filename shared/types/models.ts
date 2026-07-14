// Shared TypeScript types for data models
// Based on: specs/001-dinner-decider-enables/data-model.md

export const SESSION_CODE_LENGTH = 5;
export const SESSION_CODE_PATTERN = /^[A-Z0-9]{5}$/;

export interface Restaurant {
  placeId: string;
  name: string;
  rating?: number;
  priceLevel: number; // 0-4
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

export interface Session {
  sessionCode: string;
  hostId: string;
  state: 'waiting' | 'selecting' | 'complete' | 'expired';
  participantCount: number;
  createdAt: number;
  lastActivityAt: number;
  hostName?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  searchRadiusMiles?: number;
}

export interface Participant {
  participantId: string;
  displayName: string;
  sessionCode: string;
  joinedAt: number;
  hasSubmitted: boolean;
  isHost: boolean;
}

export interface Selection {
  participantId: string;
  sessionCode: string;
  optionIds: string[];
}

export interface Result {
  sessionCode: string;
  overlappingOptions: Restaurant[];
  allSelections: Record<string, string[]>; // displayName -> optionIds/placeIds
  restaurantNames?: Record<string, string>; // placeId -> name mapping for display
  hasOverlap: boolean;
}

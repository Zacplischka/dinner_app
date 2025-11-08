// Shared TypeScript types for data models
// Based on: specs/001-dinner-decider-enables/data-model.md

export interface Restaurant {
  placeId: string;
  name: string;
  rating?: number;
  priceLevel: number; // 0-4
  cuisineType?: string;
  address?: string;
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

export interface DinnerOption {
  optionId: string;
  displayName: string;
  description?: string;
}

export interface Selection {
  participantId: string;
  sessionCode: string;
  optionIds: string[];
}

export interface Result {
  sessionCode: string;
  overlappingOptions: DinnerOption[] | Restaurant[];
  allSelections: Record<string, string[]>; // displayName -> optionIds/placeIds
  hasOverlap: boolean;
}
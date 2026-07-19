// Endpoint-specific wire contracts for the REST Session path (issue #105).
// These are the shared shapes the backend responds with and the frontend maps
// into local state — neither side reaches for the other's internal models.
// Geocoding has no contract here: its success body is already the shared
// GeocodedArea value (Phase 1A — no response DTO when the whole body is a
// stable shared value), and its request carries no body to validate.

import type { Restaurant } from './models.js';

export interface SessionLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

// POST /api/sessions
export interface CreateSessionRequest {
  hostName: string;
  location?: SessionLocation;
  searchRadiusMiles?: number;
}

// GET /api/sessions/:sessionCode
export interface SessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
}

// POST /api/sessions response — a Session plus the host-supplied setup echoed back.
export interface CreateSessionResponse extends SessionResponse {
  location?: SessionLocation;
  searchRadiusMiles?: number;
  restaurantCount?: number;
}

// GET /api/options/:sessionCode — restaurant loading
export interface LoadRestaurantsResponse {
  sessionCode: string;
  restaurants: Restaurant[];
}

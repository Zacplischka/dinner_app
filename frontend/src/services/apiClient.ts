// REST API client for Dinner Decider
// Based on: specs/001-dinner-decider-enables/tasks.md T049

import type { DinnerOption, Restaurant } from '@dinner-app/shared/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

interface CreateSessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
  location?: Location;
  searchRadiusMiles?: number;
  restaurantCount?: number;
}

interface SessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
  location?: Location;
  searchRadiusMiles?: number;
}

interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Create a new session with optional location
 */
export async function createSession(
  hostName: string,
  location?: Location,
  searchRadiusMiles?: number
): Promise<CreateSessionResponse> {
  const body: {
    hostName: string;
    location?: Location;
    searchRadiusMiles?: number;
  } = { hostName };

  if (location) {
    body.location = location;
  }

  if (searchRadiusMiles !== undefined) {
    body.searchRadiusMiles = searchRadiusMiles;
  }

  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message || 'Failed to create session');
  }

  return response.json();
}

/**
 * Get session details by code
 */
export async function getSession(sessionCode: string): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message || 'Failed to get session');
  }

  return response.json();
}

/**
 * Get list of dinner options (deprecated - use getRestaurants)
 * @deprecated Use getRestaurants instead
 */
export async function getDinnerOptions(): Promise<DinnerOption[]> {
  const response = await fetch(`${API_BASE_URL}/options`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch dinner options');
  }

  const data = await response.json();
  return data.options;
}

/**
 * Get restaurants for a session
 */
export async function getRestaurants(sessionCode: string): Promise<Restaurant[]> {
  const response = await fetch(`${API_BASE_URL}/options/${sessionCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message || 'Failed to fetch restaurants');
  }

  const data = await response.json();
  return data.restaurants;
}

/**
 * Generic error handler for API calls
 */
export function handleApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
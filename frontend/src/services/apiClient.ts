// REST API client for Dinder - the single owner of HTTP transport
// (base URL, auth header, error shaping). State stores never call fetch.

import type {
  DinnerOption,
  Friend,
  FriendRequest,
  Restaurant,
  SessionInvite,
  UserProfile,
} from '@dinder/shared/types';
import { useAuthStore } from '../stores/authStore';

/* v8 ignore next */
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

// ============================================================================
// FRIENDS / PROFILE ENDPOINTS (authenticated)
// ============================================================================

function getAuthHeaders(): HeadersInit {
  const session = useAuthStore.getState().session;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
  return response.json();
}

/**
 * Get the current user's profile (created on first sight server-side)
 */
export async function getCurrentProfile(): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<UserProfile>(response);
}

/**
 * Search users by exact email match
 */
export async function searchUsers(email: string): Promise<UserProfile[]> {
  const response = await fetch(
    `${API_BASE_URL}/users/search?email=${encodeURIComponent(email)}`,
    { headers: getAuthHeaders() }
  );
  const data = await handleResponse<{ users: UserProfile[] }>(response);
  return data.users;
}

/**
 * List the current user's accepted friends
 */
export async function getFriends(): Promise<Friend[]> {
  const response = await fetch(`${API_BASE_URL}/friends`, {
    headers: getAuthHeaders(),
  });
  const data = await handleResponse<{ friends: Friend[] }>(response);
  return data.friends;
}

/**
 * List pending friend requests the current user received
 */
export async function getFriendRequests(): Promise<FriendRequest[]> {
  const response = await fetch(`${API_BASE_URL}/friends/requests`, {
    headers: getAuthHeaders(),
  });
  const data = await handleResponse<{ requests: FriendRequest[] }>(response);
  return data.requests;
}

/**
 * List pending session invites for the current user
 */
export async function getSessionInvites(): Promise<SessionInvite[]> {
  const response = await fetch(`${API_BASE_URL}/invites`, {
    headers: getAuthHeaders(),
  });
  const data = await handleResponse<{ invites: SessionInvite[] }>(response);
  return data.invites;
}

/**
 * Send a friend request to a user by email
 */
export async function sendFriendRequest(email: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/request`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email }),
  });
  await handleResponse(response);
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${requestId}/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
}

/**
 * Decline a friend request
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${requestId}/decline`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
}

/**
 * Remove a friend (unfriend)
 */
export async function removeFriend(friendId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/${friendId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
}

/**
 * Invite friends to join a session
 */
export async function inviteFriendsToSession(
  sessionCode: string,
  friendIds: string[]
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionCode}/invite`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ friendIds }),
  });
  await handleResponse(response);
}

/**
 * Accept a session invite; returns the session code to join
 */
export async function acceptSessionInvite(inviteId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/invites/${inviteId}/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const data = await handleResponse<{ success: boolean; sessionCode: string }>(response);
  return data.sessionCode;
}

/**
 * Decline a session invite
 */
export async function declineSessionInvite(inviteId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/invites/${inviteId}/decline`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
}

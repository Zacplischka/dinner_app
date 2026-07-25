// REST API client for Dinder - the single owner of HTTP transport
// (base URL, auth header, error shaping). State stores never call fetch.

import type {
  AcceptSessionInviteResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  Friend,
  FriendRequest,
  FriendRequestsResponse,
  FriendsListResponse,
  GeocodedArea,
  GetProfileResponse,
  LoadRestaurantsResponse,
  Restaurant,
  SearchUsersResponse,
  SendFriendRequestPayload,
  SendSessionInviteRequest,
  SessionInvite,
  SessionInvitesResponse,
  SessionLocation,
  SessionResponse,
  UserProfile,
  VenueSearchRequest,
  VenueSearchResponse,
} from '@dinder/shared/types';
import { useAuthStore } from '../stores/authStore';

/* v8 ignore next */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * Create a new session with optional location
 */
export async function createSession(
  hostName: string,
  location?: SessionLocation,
  searchRadiusMiles?: number
): Promise<CreateSessionResponse> {
  const body: CreateSessionRequest = { hostName };

  if (location) {
    body.location = location;
  }

  if (searchRadiusMiles !== undefined) {
    body.searchRadiusMiles = searchRadiusMiles;
  }

  return request<CreateSessionResponse>('/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Resolve a suburb or postcode to coordinates and a human-readable area
 */
export async function geocodeArea(query: string): Promise<GeocodedArea> {
  return request<GeocodedArea>(`/geocode?query=${encodeURIComponent(query)}`);
}

/**
 * Resolve browser coordinates to a best-effort human-readable area
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedArea> {
  return request<GeocodedArea>(`/geocode?latitude=${latitude}&longitude=${longitude}`);
}

/**
 * Get session details by code
 */
export async function getSession(sessionCode: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/sessions/${sessionCode}`);
}

/**
 * Get restaurants for a session
 */
export async function getRestaurants(sessionCode: string): Promise<Restaurant[]> {
  const data = await request<LoadRestaurantsResponse>(`/options/${sessionCode}`);
  return resolvePhotoUrls(data.restaurants);
}

export async function getVenues(
  location: { latitude: number; longitude: number },
  radiusMiles: number
): Promise<VenueSearchResponse> {
  const input: VenueSearchRequest = { ...location, radiusMiles };
  const query = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    radiusMiles: String(input.radiusMiles),
  });
  const result = await request<VenueSearchResponse>(`/comparison/venues?${query.toString()}`);
  return { ...result, venues: resolvePhotoUrls(result.venues) };
}

/**
 * Point relative photo paths at the API origin. The backend emits
 * `/api/comparison/photo?...` and nothing else, but in production the API is a
 * different origin from the app, so an unprefixed path would 404 against the
 * frontend host. Anything already absolute is left alone rather than mangled.
 */
export function resolvePhotoUrls<T extends { photoUrl?: string }>(items: T[]): T[] {
  const locationOrigin = globalThis.location?.origin || 'http://localhost';
  const apiOrigin = new URL(API_BASE_URL, locationOrigin).origin;
  return items.map((item) =>
    item.photoUrl?.startsWith('/') ? { ...item, photoUrl: `${apiOrigin}${item.photoUrl}` } : item
  );
}

// ============================================================================
// FRIENDS / PROFILE ENDPOINTS (authenticated)
// ============================================================================

/**
 * request(), plus the bearer token. Separate from request() rather than folded
 * into it because the Session and geocode endpoints are deliberately anonymous
 * and must not carry the user's token.
 */
function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = useAuthStore.getState().session;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return request<T>(path, { ...init, headers: { ...headers, ...init?.headers } });
}

/**
 * The one typed error thrown for any failed API response. `code` is a stable
 * public `ApiErrorCode` once the backend emits canonical errors (#104); during
 * migration it may be a legacy `error` value verbatim (e.g. `validation_error`),
 * or `UNKNOWN` when the failure body carries no code at all.
 */
export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Canonical bodies are { code, message }; legacy bodies have only a
    // lowercase `error` (and sometimes message); some failures have no body.
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
      message?: string;
    };
    throw new ApiClientError(
      body.code || body.error || 'UNKNOWN',
      body.message || `HTTP error ${response.status}`,
      response.status
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  return handleResponse<T>(await (init ? fetch(url, init) : fetch(url)));
}

/**
 * Get the current user's profile (created on first sight server-side)
 */
export async function getCurrentProfile(): Promise<GetProfileResponse> {
  return authedRequest<GetProfileResponse>('/users/me');
}

/**
 * Search users by exact email match
 */
export async function searchUsers(email: string): Promise<UserProfile[]> {
  const data = await authedRequest<SearchUsersResponse>(
    `/users/search?email=${encodeURIComponent(email)}`
  );
  return data.users;
}

/**
 * List the current user's accepted friends
 */
export async function getFriends(): Promise<Friend[]> {
  const data = await authedRequest<FriendsListResponse>('/friends');
  return data.friends;
}

/**
 * List pending friend requests the current user received
 */
export async function getFriendRequests(): Promise<FriendRequest[]> {
  const data = await authedRequest<FriendRequestsResponse>('/friends/requests');
  return data.requests;
}

/**
 * List pending session invites for the current user
 */
export async function getSessionInvites(): Promise<SessionInvite[]> {
  const data = await authedRequest<SessionInvitesResponse>('/invites');
  return data.invites;
}

/**
 * Send a friend request to a user by email
 */
export async function sendFriendRequest(email: string): Promise<void> {
  const body: SendFriendRequestPayload = { email };
  await authedRequest<void>('/friends/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  await authedRequest<void>(`/friends/${requestId}/accept`, {
    method: 'POST',
  });
}

/**
 * Decline a friend request
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  await authedRequest<void>(`/friends/${requestId}/decline`, {
    method: 'POST',
  });
}

/**
 * Remove a friend (unfriend)
 */
export async function removeFriend(friendId: string): Promise<void> {
  await authedRequest<void>(`/friends/${friendId}`, {
    method: 'DELETE',
  });
}

/**
 * Invite friends to join a session
 */
export async function inviteFriendsToSession(
  sessionCode: string,
  friendIds: string[]
): Promise<void> {
  const body: SendSessionInviteRequest = { friendIds };
  await authedRequest<unknown>(`/sessions/${sessionCode}/invite`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Accept a session invite; returns the session code to join
 */
export async function acceptSessionInvite(inviteId: string): Promise<string> {
  const data = await authedRequest<AcceptSessionInviteResponse>(`/invites/${inviteId}/accept`, {
    method: 'POST',
  });
  return data.sessionCode;
}

/**
 * Decline a session invite
 */
export async function declineSessionInvite(inviteId: string): Promise<void> {
  await authedRequest<unknown>(`/invites/${inviteId}/decline`, {
    method: 'POST',
  });
}

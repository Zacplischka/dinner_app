// REST API client for Dinder - the single owner of HTTP transport
// (base URL, auth header, error shaping). State stores never call fetch.

import type {
  AcceptSessionInviteResponse,
  Branch,
  DeckEntry,
  Craving,
  ClaimLineRequest,
  ClaimLineResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  Friend,
  FriendRequest,
  FriendRequestsResponse,
  FriendsListResponse,
  GeocodedArea,
  GetProfileResponse,
  LoadRestaurantsResponse,
  SearchUsersResponse,
  SendFriendRequestPayload,
  SendSessionInviteRequest,
  SessionInvite,
  SessionInvitesResponse,
  SessionLocation,
  SessionResponse,
  ShoppingListResponse,
  SwapLineRequest,
  SwapLineResponse,
  UserProfile,
  VenueSearchRequest,
  VenueSearchResponse,
} from '@dinder/shared/types';
import { useAuthStore } from '../stores/authStore';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * Create a new session. Everything past the host's name is setup the chosen
 * Branch decides: a location and radius for Eat Out and Takeaway, a Craving and
 * Headcount for Cook. Absent fields are simply left off the wire (ADR 0007).
 */
export async function createSession(
  hostName: string,
  setup: {
    location?: SessionLocation;
    searchRadiusMiles?: number;
    branch?: Branch;
    craving?: Craving;
    headcount?: number;
  } = {}
): Promise<CreateSessionResponse> {
  const body: CreateSessionRequest = { hostName };

  if (setup.location) {
    body.location = setup.location;
  }

  if (setup.searchRadiusMiles !== undefined) {
    body.searchRadiusMiles = setup.searchRadiusMiles;
  }

  if (setup.branch) {
    body.branch = setup.branch;
  }

  if (setup.craving) {
    body.craving = setup.craving;
  }

  if (setup.headcount !== undefined) {
    body.headcount = setup.headcount;
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
export async function getRestaurants(sessionCode: string): Promise<DeckEntry[]> {
  const data = await request<LoadRestaurantsResponse>(`/options/${sessionCode}`);
  return resolvePhotoUrls(data.restaurants);
}

/**
 * Read a Shopping List. Anonymous by design: the URL is the whole capability,
 * so this must never carry a token or a session (#229).
 */
export async function getShoppingList(listId: string): Promise<ShoppingListResponse> {
  return request<ShoppingListResponse>(`/lists/${encodeURIComponent(listId)}`);
}

const claimPath = (listId: string, lineId: string) =>
  `/lists/${encodeURIComponent(listId)}/lines/${encodeURIComponent(lineId)}/claim`;

/**
 * Claim one Ingredient Line, as a self-declared name and nothing else (#263).
 * Answers with the whole list, which may show the line held by whoever tapped
 * first — that is the answer, not a failure.
 */
export async function claimShoppingListLine(
  listId: string,
  lineId: string,
  displayName: string
): Promise<ClaimLineResponse> {
  return request<ClaimLineResponse>(claimPath(listId, lineId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName } satisfies ClaimLineRequest),
  });
}

/** Release the Claim on one line, whoever holds it (#229). */
export async function releaseShoppingListLine(
  listId: string,
  lineId: string
): Promise<ClaimLineResponse> {
  return request<ClaimLineResponse>(claimPath(listId, lineId), { method: 'DELETE' });
}

/**
 * Swap one Ingredient Line onto one of the candidates it already offers, or
 * onto nothing at all with a null Stockcode — "none of these" (#264). The
 * answer is the whole list, re-priced, and it is shared: everyone holding the
 * URL sees the correction.
 */
export async function swapShoppingListLine(
  listId: string,
  lineId: string,
  stockcode: number | null
): Promise<SwapLineResponse> {
  return request<SwapLineResponse>(
    `/lists/${encodeURIComponent(listId)}/lines/${encodeURIComponent(lineId)}/swap`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockcode } satisfies SwapLineRequest),
    }
  );
}

/**
 * Every outbound Retailer link goes through the backend's counting redirect
 * (#228) — a product page by Stockcode, or a search for an Unmatched line.
 * Same shape as the delivery redirect the Match card already uses.
 */
export function retailerRedirectUrl(target: { stockcode: number } | { q: string }): string {
  const query =
    'stockcode' in target ? `stockcode=${target.stockcode}` : `q=${encodeURIComponent(target.q)}`;
  return `${API_BASE_URL}/redirect?retailer=woolworths&${query}`;
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
 * Point relative photo paths at the API origin: in production the API is a
 * different origin from the app, so an unprefixed path would 404 against the
 * frontend host.
 *
 * ponytail: assumes the backend only ever emits `/api/comparison/photo?...`.
 * Ceiling: a future producer of some other relative path gets prefixed too.
 * Anything already absolute is left alone rather than mangled, so the blast
 * radius is a wrong origin, not a corrupted URL. Upgrade path is to match the
 * proxy prefix explicitly if a second relative photo source ever appears.
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
 * public `ApiErrorCode`: the backend emits canonical { code, message } bodies
 * everywhere (#104, shipped). The legacy `error`-field branch below is dead
 * defence, not a live compatibility path; `UNKNOWN` covers a failure body
 * carrying no code at all.
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
    // Canonical bodies are { code, message } — the backend emits them
    // everywhere since #104, so the lowercase `error` branch is dead defence;
    // some failures have no body at all.
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

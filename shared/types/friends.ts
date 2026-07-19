// Shared types for friends feature

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface Friend {
  id: string;
  friendshipId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  status: 'pending' | 'accepted';
}

export interface FriendRequest {
  id: string;
  fromUser: UserProfile;
  createdAt: string;
}

export interface SessionInvite {
  id: string;
  sessionCode: string;
  inviter: UserProfile;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
}

// API Request/Response types
export interface SendFriendRequestPayload {
  email: string;
}

export interface AcceptFriendRequestPayload {
  requestId: string;
}

export interface InviteToSessionPayload {
  sessionCode: string;
  friendIds: string[];
}

// Read-operation response contracts — one per endpoint (issue #106).
// The backend type-checks each response against these and the frontend
// consumes them as the wire shapes; neither side re-declares them locally.

/** GET /api/users/me — the caller's own profile, created on first sight. */
export type GetProfileResponse = UserProfile;

/** GET /api/users/search?email= — exact email matches, excluding the caller. */
export interface SearchUsersResponse {
  users: UserProfile[];
}

/** GET /api/friends — the caller's accepted Friends. */
export interface FriendsListResponse {
  friends: Friend[];
}

/** GET /api/friends/requests — pending Friend Requests the caller received. */
export interface FriendRequestsResponse {
  requests: FriendRequest[];
}

export interface SessionInvitesResponse {
  invites: SessionInvite[];
}

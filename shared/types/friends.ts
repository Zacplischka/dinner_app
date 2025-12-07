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

export interface SearchUsersResponse {
  users: UserProfile[];
}

export interface FriendsListResponse {
  friends: Friend[];
}

export interface FriendRequestsResponse {
  requests: FriendRequest[];
}

export interface SessionInvitesResponse {
  invites: SessionInvite[];
}

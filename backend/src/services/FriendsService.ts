// FriendsService - business rules for the social graph
// (Profiles, Friendships, Session Invites). Persistence lives in FriendsStore;
// HTTP shaping lives in the friends router.
//
// createFriendsService(deps) builds the service over an injected store (tests
// pass an in-memory fake); server.ts constructs the production instance.

import type * as friendsStore from '../store/friendsStore.js';
import { getAuthProfileDefaults } from '../api/authMetadata.js';
import { DomainError } from './DomainError.js';
import type { Friend, FriendRequest, SessionInvite, UserProfile } from '@dinder/shared/types';

/** The FriendsStore surface the service depends on. */
type FriendsStore = typeof friendsStore;

interface FriendsServiceDeps {
  store: FriendsStore;
}

export function createFriendsService({ store }: FriendsServiceDeps) {
  // --- Profiles ------------------------------------------------------------

  /**
   * Get the user's profile, creating it from auth metadata on first sight.
   */
  async function getCurrentProfile(
    userId: string,
    email: string | undefined
  ): Promise<UserProfile> {
    const profile = await store.getProfileById(userId);
    if (profile) {
      return profile;
    }

    // Profile doesn't exist yet - create it from Supabase Auth data
    const metadata = await store.getAuthUserMetadata(userId);
    const profileDefaults = getAuthProfileDefaults(metadata, email);

    return store.createProfile({
      id: userId,
      email: email || null,
      displayName: profileDefaults.displayName,
      avatarUrl: profileDefaults.avatarUrl,
    });
  }

  async function searchUsers(email: string, userId: string): Promise<UserProfile[]> {
    return store.searchProfilesByEmail(email, userId);
  }

  // --- Friends ---------------------------------------------------------------

  async function listFriends(userId: string): Promise<Friend[]> {
    const friendships = await store.listAcceptedFriendships(userId);

    // The friend is whichever side of the friendship isn't the user
    const friendIds = friendships.map((f) => (f.userId === userId ? f.friendId : f.userId));

    if (friendIds.length === 0) {
      return [];
    }

    const profiles = await store.listProfilesByIds(friendIds);
    if (!profiles) {
      throw new DomainError('database_error', 'Failed to fetch friend profiles');
    }

    return friendships.map((friendship) => {
      const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;
      const profile = profiles.find((p) => p.id === friendId);

      return {
        id: friendId,
        friendshipId: friendship.id,
        displayName: profile?.displayName || 'Unknown User',
        avatarUrl: profile?.avatarUrl || null,
        email: profile?.email || null,
        status: 'accepted' as const,
      };
    });
  }

  async function listFriendRequests(userId: string): Promise<FriendRequest[]> {
    const requests = await store.listPendingRequestsForRecipient(userId);

    if (requests.length === 0) {
      return [];
    }

    const profiles = await store.listProfilesByIds(requests.map((r) => r.fromUserId));
    if (!profiles) {
      throw new DomainError('database_error', 'Failed to fetch requester profiles');
    }

    return requests.map((request) => ({
      id: request.id,
      fromUser: profiles.find((p) => p.id === request.fromUserId) || {
        id: request.fromUserId,
        displayName: 'Unknown User',
        avatarUrl: null,
        email: null,
      },
      createdAt: request.createdAt,
    }));
  }

  /**
   * Send a friend request to a user by email.
   */
  async function sendFriendRequest(userId: string, email: string): Promise<void> {
    const targetUser = await store.findProfileIdByEmail(email);
    if (!targetUser) {
      throw new DomainError('not_found', 'User not found with that email');
    }

    if (targetUser.id === userId) {
      throw new DomainError('validation_error', 'You cannot send a friend request to yourself');
    }

    const existingFriendship = await store.findFriendshipBetween(userId, targetUser.id);
    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        throw new DomainError('already_friends', 'You are already friends with this user');
      }
      if (existingFriendship.status === 'pending') {
        throw new DomainError('request_pending', 'A friend request is already pending');
      }
      if (existingFriendship.status === 'blocked') {
        throw new DomainError('blocked', 'Unable to send friend request');
      }
    }

    await store.createFriendRequest(userId, targetUser.id);
  }

  /** Only the recipient of a pending request may accept it. */
  async function acceptFriendRequest(userId: string, requestId: string): Promise<void> {
    const request = await store.findPendingRequestForRecipient(requestId, userId);
    if (!request) {
      throw new DomainError('not_found', 'Friend request not found');
    }

    await store.acceptFriendRequest(requestId);
  }

  /** Only the recipient of a pending request may decline it; declining deletes the row. */
  async function declineFriendRequest(userId: string, requestId: string): Promise<void> {
    await store.deletePendingRequestForRecipient(requestId, userId);
  }

  /** Remove a friendship in either direction. */
  async function removeFriend(userId: string, friendId: string): Promise<void> {
    await store.deleteFriendshipBetween(userId, friendId);
  }

  // --- Session Invites ---------------------------------------------------------

  /**
   * Invite friends into a session. Ids without an accepted Friendship with the
   * inviter are dropped; inviting only non-friends is an error.
   * Returns how many friends were invited.
   */
  async function inviteFriendsToSession(
    userId: string,
    sessionCode: string,
    friendIds: string[]
  ): Promise<number> {
    const friendships = await store.listAcceptedFriendPairs(userId);
    const actualFriendIds = new Set(
      friendships.map((f) => (f.user_id === userId ? f.friend_id : f.user_id))
    );

    const validFriendIds = friendIds.filter((id) => actualFriendIds.has(id));
    if (validFriendIds.length === 0) {
      throw new DomainError('validation_error', 'No valid friend IDs provided');
    }

    await store.createSessionInvites(
      validFriendIds.map((friendId) => ({
        session_code: sessionCode,
        inviter_id: userId,
        invitee_id: friendId,
        status: 'pending' as const,
      }))
    );

    return validFriendIds.length;
  }

  async function listSessionInvites(userId: string): Promise<SessionInvite[]> {
    const invites = await store.listPendingInvitesForInvitee(userId);

    if (invites.length === 0) {
      return [];
    }

    // A failed inviter-profile lookup falls back to placeholder profiles
    const inviterIds = [...new Set(invites.map((i) => i.inviter_id))];
    const profiles = await store.listProfilesByIds(inviterIds);

    return invites.map((invite) => ({
      id: invite.id,
      sessionCode: invite.session_code,
      inviter: profiles?.find((p) => p.id === invite.inviter_id) || {
        id: invite.inviter_id,
        displayName: 'Unknown User',
        avatarUrl: null,
        email: null,
      },
      status: invite.status,
      createdAt: invite.created_at,
    }));
  }

  /** Accept a pending invite; returns the Session Code to join. */
  async function acceptSessionInvite(userId: string, inviteId: string): Promise<string> {
    const invite = await store.acceptSessionInvite(inviteId, userId);
    if (!invite) {
      throw new DomainError('not_found', 'Session invite not found');
    }
    return invite.session_code;
  }

  async function declineSessionInvite(userId: string, inviteId: string): Promise<void> {
    await store.declineSessionInvite(inviteId, userId);
  }

  return {
    getCurrentProfile,
    searchUsers,
    listFriends,
    listFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    inviteFriendsToSession,
    listSessionInvites,
    acceptSessionInvite,
    declineSessionInvite,
  };
}

export type FriendsService = ReturnType<typeof createFriendsService>;

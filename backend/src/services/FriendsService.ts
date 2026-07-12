// FriendsService - business rules for the social graph
// (Profiles, Friendships, Session Invites). Persistence lives in FriendsStore;
// HTTP shaping lives in the friends router.

import * as friendsStore from '../store/friendsStore.js';
import { getAuthProfileDefaults } from '../api/authMetadata.js';
import { DomainError } from './DomainError.js';
import type { Profile } from './supabase.js';
import type { Friend, FriendRequest, UserProfile } from '@dinder/shared/types';

// --- Profiles ------------------------------------------------------------

/**
 * Get the user's profile, creating it from auth metadata on first sight.
 */
export async function getCurrentProfile(
  userId: string,
  email: string | undefined
): Promise<UserProfile> {
  const profile = await friendsStore.getProfileById(userId);
  if (profile) {
    return mapProfileToUserProfile(profile);
  }

  // Profile doesn't exist yet - create it from Supabase Auth data
  const metadata = await friendsStore.getAuthUserMetadata(userId);
  const profileDefaults = getAuthProfileDefaults(metadata, email);

  const created = await friendsStore.createProfile({
    id: userId,
    email: email || null,
    display_name: profileDefaults.displayName,
    avatar_url: profileDefaults.avatarUrl,
  });

  return mapProfileToUserProfile(created);
}

export async function searchUsers(email: string, userId: string): Promise<UserProfile[]> {
  const profiles = await friendsStore.searchProfilesByEmail(email, userId);
  return profiles.map(mapProfileToUserProfile);
}

// --- Friends ---------------------------------------------------------------

export async function listFriends(userId: string): Promise<Friend[]> {
  const friendships = await friendsStore.listAcceptedFriendships(userId);

  // The friend is whichever side of the friendship row isn't the user
  const friendIds = friendships.map((f) =>
    f.user_id === userId ? f.friend_id : f.user_id
  );

  if (friendIds.length === 0) {
    return [];
  }

  const profiles = await friendsStore.listProfilesByIds(friendIds);
  if (!profiles) {
    throw new DomainError('database_error', 'Failed to fetch friend profiles');
  }

  return friendships.map((friendship) => {
    const friendId = friendship.user_id === userId ? friendship.friend_id : friendship.user_id;
    const profile = profiles.find((p) => p.id === friendId);

    return {
      id: friendId,
      friendshipId: friendship.id,
      displayName: profile?.display_name || 'Unknown User',
      avatarUrl: profile?.avatar_url || null,
      email: profile?.email || null,
      status: 'accepted' as const,
    };
  });
}

export async function listFriendRequests(userId: string): Promise<FriendRequest[]> {
  const requests = await friendsStore.listPendingRequestsForRecipient(userId);

  if (requests.length === 0) {
    return [];
  }

  const profiles = await friendsStore.listProfilesByIds(requests.map((r) => r.user_id));
  if (!profiles) {
    throw new DomainError('database_error', 'Failed to fetch requester profiles');
  }

  return requests.map((request) => ({
    id: request.id,
    fromUser: mapProfileToUserProfile(
      profiles.find((p) => p.id === request.user_id) || {
        id: request.user_id,
        display_name: 'Unknown User',
        avatar_url: null,
        email: null,
      }
    ),
    createdAt: request.created_at,
  }));
}

/**
 * Send a friend request to a user by email.
 * Returns the new request's id.
 */
export async function sendFriendRequest(userId: string, email: string): Promise<string> {
  const targetUser = await friendsStore.findProfileIdByEmail(email);
  if (!targetUser) {
    throw new DomainError('not_found', 'User not found with that email');
  }

  if (targetUser.id === userId) {
    throw new DomainError('validation_error', 'You cannot send a friend request to yourself');
  }

  const existingFriendship = await friendsStore.findFriendshipBetween(userId, targetUser.id);
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

  const newRequest = await friendsStore.createFriendRequest(userId, targetUser.id);
  return newRequest.id;
}

/** Only the recipient of a pending request may accept it. */
export async function acceptFriendRequest(userId: string, requestId: string): Promise<void> {
  const request = await friendsStore.findPendingRequestForRecipient(requestId, userId);
  if (!request) {
    throw new DomainError('not_found', 'Friend request not found');
  }

  await friendsStore.acceptFriendRequest(requestId);
}

/** Only the recipient of a pending request may decline it; declining deletes the row. */
export async function declineFriendRequest(userId: string, requestId: string): Promise<void> {
  await friendsStore.deletePendingRequestForRecipient(requestId, userId);
}

/** Remove a friendship in either direction. */
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await friendsStore.deleteFriendshipBetween(userId, friendId);
}

/**
 * Map a database Profile to a UserProfile API response object
 */
export function mapProfileToUserProfile(profile: Partial<Profile>): UserProfile {
  return {
    id: profile.id || '',
    displayName: profile.display_name || 'Unknown User',
    avatarUrl: profile.avatar_url || null,
    email: profile.email || null,
  };
}

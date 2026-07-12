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

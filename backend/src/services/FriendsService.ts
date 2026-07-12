// FriendsService - business rules for the social graph
// (Profiles, Friendships, Session Invites). Persistence lives in FriendsStore;
// HTTP shaping lives in the friends router.

import * as friendsStore from '../store/friendsStore.js';
import { getAuthProfileDefaults } from '../api/authMetadata.js';
import type { Profile } from './supabase.js';
import type { UserProfile } from '@dinder/shared/types';

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

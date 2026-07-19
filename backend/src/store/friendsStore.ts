// FriendsStore - the sole keeper of the persistent social graph.
// Owns every Supabase query for Profiles, Friendships, and Session Invites;
// nothing else in the backend touches the Supabase client for social data.
// See CONTEXT.md for the domain language (Profile, Friendship, Session Invite).
//
// Boundary rule (#106): snake_case database rows never cross the store. Read
// functions map rows to camelCase shared values (UserProfile and the shapes
// below) before returning; only the not-yet-migrated mutation/invite queries
// still return raw columns, and #107/#108 own those.

import { logger } from '../logger.js';
import { supabase, type Profile } from '../services/supabase.js';
import { DomainError } from '../services/DomainError.js';
import type { UserProfile } from '@dinder/shared/types';

const profileSelect = 'id, display_name, avatar_url, email';

type ProfileRow = Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'email'>;

// The single row→wire mapping for profiles. Missing fields fall back the same
// way the old service-side mapper did (partial rows only occur in tests).
function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id || '',
    displayName: row.display_name || 'Unknown User',
    avatarUrl: row.avatar_url || null,
    email: row.email || null,
  };
}

/** An accepted Friendship as a camelCase value; callers pick which side is the friend. */
export interface AcceptedFriendship {
  id: string;
  userId: string;
  friendId: string;
}

/** A pending Friend Request received by a user, as a camelCase value. */
export interface PendingFriendRequest {
  id: string;
  fromUserId: string;
  createdAt: string;
}

// Store functions return data and throw DomainError('database_error', ...) on
// query failure. Functions documented as returning null instead fold specific
// failures into null because their callers treat them as "not there".

// --- Profiles ------------------------------------------------------------

/** Returns null when no profile exists yet. */
export async function getProfileById(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    logger.error({ err: error }, 'Error fetching profile');
    throw new DomainError('database_error', 'Failed to fetch user profile');
  }
  return toUserProfile(data);
}

export async function getAuthUserMetadata(userId: string): Promise<unknown> {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  return authUser?.user?.user_metadata;
}

export async function createProfile(profile: {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    })
    .select(profileSelect)
    .single();

  if (error) {
    logger.error({ err: error }, 'Error creating profile');
    throw new DomainError('database_error', 'Failed to create user profile');
  }
  return toUserProfile(data);
}

// Exact email match only (privacy protection)
export async function searchProfilesByEmail(
  email: string,
  excludeUserId: string
): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('email', email.toLowerCase())
    .neq('id', excludeUserId)
    .limit(10);

  if (error) {
    logger.error({ err: error }, 'Error searching users');
    throw new DomainError('database_error', 'Failed to search users');
  }
  return (data || []).map(toUserProfile);
}

/** Returns null when the query fails; callers decide whether that's fatal. */
export async function listProfilesByIds(ids: string[]): Promise<UserProfile[] | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .in('id', ids);

  if (error) {
    logger.error({ err: error }, 'Error fetching profiles');
    return null;
  }
  return (data || []).map(toUserProfile);
}

/** Returns null when no profile matches (or the lookup fails). */
export async function findProfileIdByEmail(email: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  return error ? null : data;
}

// --- Friendships -----------------------------------------------------------

const friendshipSelect = 'id, user_id, friend_id, status, created_at';

export async function listAcceptedFriendships(userId: string): Promise<AcceptedFriendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) {
    logger.error({ err: error }, 'Error fetching friendships');
    throw new DomainError('database_error', 'Failed to fetch friends');
  }
  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    friendId: row.friend_id,
  }));
}

export async function listPendingRequestsForRecipient(
  userId: string
): Promise<PendingFriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, created_at')
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (error) {
    logger.error({ err: error }, 'Error fetching friend requests');
    throw new DomainError('database_error', 'Failed to fetch friend requests');
  }
  return (data || []).map((row) => ({
    id: row.id,
    fromUserId: row.user_id,
    createdAt: row.created_at,
  }));
}

/** Existence check for a pair, in either direction. Null when no row exists. */
export async function findFriendshipBetween(userId: string, otherUserId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, status')
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${otherUserId}),` +
      `and(user_id.eq.${otherUserId},friend_id.eq.${userId})`
    )
    .maybeSingle();

  if (error) {
    logger.error({ err: error }, 'Error checking existing friendship');
    throw new DomainError('database_error', 'Failed to check existing friendship');
  }
  return data;
}

export async function createFriendRequest(userId: string, friendId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .insert({
      user_id: userId,
      friend_id: friendId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    logger.error({ err: error }, 'Error creating friend request');
    throw new DomainError('database_error', 'Failed to create friend request');
  }
  return data;
}

/** Returns null when no matching pending request exists (or the lookup fails). */
export async function findPendingRequestForRecipient(requestId: string, userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id')
    .eq('id', requestId)
    .eq('friend_id', userId)
    .eq('status', 'pending')
    .single();

  return error ? null : data;
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId);

  if (error) {
    logger.error({ err: error }, 'Error accepting friend request');
    throw new DomainError('database_error', 'Failed to accept friend request');
  }
}

export async function deletePendingRequestForRecipient(requestId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', requestId)
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (error) {
    logger.error({ err: error }, 'Error declining friend request');
    throw new DomainError('database_error', 'Failed to decline friend request');
  }
}

export async function deleteFriendshipBetween(userId: string, friendId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
      `and(user_id.eq.${friendId},friend_id.eq.${userId})`
    );

  if (error) {
    logger.error({ err: error }, 'Error removing friend');
    throw new DomainError('database_error', 'Failed to remove friend');
  }
}

// Same rows as listAcceptedFriendships but only the pair columns; kept as
// its own query so each caller's shape and failure handling stay exact.
export async function listAcceptedFriendPairs(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) {
    logger.error({ err: error }, 'Error verifying friendships');
    throw new DomainError('database_error', 'Failed to verify friendships');
  }
  return data || [];
}

// --- Session Invites ---------------------------------------------------------

const sessionInviteSelect = 'id, session_code, inviter_id, status, created_at';

type SessionInviteRow = {
  session_code: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending';
};

export async function createSessionInvites(invites: SessionInviteRow[]): Promise<void> {
  // Upsert to handle duplicate invites gracefully
  const { error } = await supabase
    .from('session_invites')
    .upsert(invites, {
      onConflict: 'session_code,inviter_id,invitee_id',
      ignoreDuplicates: true,
    });

  if (error) {
    // If upsert fails, try inserting individually (ignoring duplicates)
    logger.warn({ err: error }, 'Upsert failed, trying individual inserts');
    for (const invite of invites) {
      await supabase.from('session_invites').insert(invite);
    }
  }
}

export async function listPendingInvitesForInvitee(userId: string) {
  const { data, error } = await supabase
    .from('session_invites')
    .select(sessionInviteSelect)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error }, 'Error fetching invites');
    throw new DomainError('database_error', 'Failed to fetch session invites');
  }
  return data || [];
}

/**
 * Mark a pending invite accepted; only the invitee may do so.
 * Returns the invite's session code, or null when no matching pending
 * invite exists (or the update fails).
 */
export async function acceptSessionInvite(inviteId: string, userId: string) {
  const { data, error } = await supabase
    .from('session_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .select('session_code')
    .single();

  return error ? null : data;
}

/** Mark a pending invite declined; only the invitee may do so. */
export async function declineSessionInvite(inviteId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('session_invites')
    .update({ status: 'declined' })
    .eq('id', inviteId)
    .eq('invitee_id', userId)
    .eq('status', 'pending');

  if (error) {
    logger.error({ err: error }, 'Error declining invite');
    throw new DomainError('database_error', 'Failed to decline invite');
  }
}

// FriendsStore - the sole keeper of the persistent social graph.
// Owns every Supabase query for Profiles, Friendships, and Session Invites;
// nothing else in the backend touches the Supabase client for social data.
// See CONTEXT.md for the domain language (Profile, Friendship, Session Invite).

import { supabase } from '../services/supabase.js';
import { DomainError } from '../services/DomainError.js';

const profileSelect = 'id, display_name, avatar_url, email';

// Store functions return data and throw DomainError('database_error', ...) on
// query failure. Functions documented as returning null instead fold specific
// failures into null because their callers treat them as "not there".

// --- Profiles ------------------------------------------------------------

/** Returns null when no profile exists yet. */
export async function getProfileById(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching profile:', error);
    throw new DomainError('database_error', 'Failed to fetch user profile');
  }
  return data;
}

export async function getAuthUserMetadata(userId: string): Promise<unknown> {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  return authUser?.user?.user_metadata;
}

export async function createProfile(profile: {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
}) {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select(profileSelect)
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    throw new DomainError('database_error', 'Failed to create user profile');
  }
  return data;
}

// Exact email match only (privacy protection)
export async function searchProfilesByEmail(email: string, excludeUserId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('email', email.toLowerCase())
    .neq('id', excludeUserId)
    .limit(10);

  if (error) {
    console.error('Error searching users:', error);
    throw new DomainError('database_error', 'Failed to search users');
  }
  return data || [];
}

/** Returns null when the query fails; callers decide whether that's fatal. */
export async function listProfilesByIds(ids: string[]) {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .in('id', ids);

  if (error) {
    console.error('Error fetching profiles:', error);
    return null;
  }
  return data || [];
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

export async function listAcceptedFriendships(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) {
    console.error('Error fetching friendships:', error);
    throw new DomainError('database_error', 'Failed to fetch friends');
  }
  return data || [];
}

export async function listPendingRequestsForRecipient(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, created_at')
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error fetching friend requests:', error);
    throw new DomainError('database_error', 'Failed to fetch friend requests');
  }
  return data || [];
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
    console.error('Error checking existing friendship:', error);
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
    console.error('Error creating friend request:', error);
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
    console.error('Error accepting friend request:', error);
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
    console.error('Error declining friend request:', error);
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
    console.error('Error removing friend:', error);
    throw new DomainError('database_error', 'Failed to remove friend');
  }
}

// Same rows as listAcceptedFriendships but only the pair columns; kept as
// its own query so each caller's shape and failure handling stay exact.
export async function listAcceptedFriendPairs(userId: string) {
  return supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');
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
    console.warn('Upsert failed, trying individual inserts:', error);
    for (const invite of invites) {
      await supabase.from('session_invites').insert(invite);
    }
  }
}

export async function listPendingInvitesForInvitee(userId: string) {
  return supabase
    .from('session_invites')
    .select(sessionInviteSelect)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
}

export async function acceptSessionInvite(inviteId: string, userId: string) {
  return supabase
    .from('session_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .select('session_code')
    .single();
}

export async function declineSessionInvite(inviteId: string, userId: string) {
  return supabase
    .from('session_invites')
    .update({ status: 'declined' })
    .eq('id', inviteId)
    .eq('invitee_id', userId)
    .eq('status', 'pending');
}

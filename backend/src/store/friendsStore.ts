// FriendsStore - the sole keeper of the persistent social graph.
// Owns every Supabase query for Profiles, Friendships, and Session Invites;
// nothing else in the backend touches the Supabase client for social data.
// See CONTEXT.md for the domain language (Profile, Friendship, Session Invite).

import { supabase } from '../services/supabase.js';

export const profileSelect = 'id, display_name, avatar_url, email';

// --- Profiles ------------------------------------------------------------

export async function getProfileById(userId: string) {
  return supabase
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .single();
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
  return supabase
    .from('profiles')
    .insert(profile)
    .select(profileSelect)
    .single();
}

// Exact email match only (privacy protection)
export async function searchProfilesByEmail(email: string, excludeUserId: string) {
  return supabase
    .from('profiles')
    .select(profileSelect)
    .eq('email', email.toLowerCase())
    .neq('id', excludeUserId)
    .limit(10);
}

export async function listProfilesByIds(ids: string[]) {
  return supabase
    .from('profiles')
    .select(profileSelect)
    .in('id', ids);
}

export async function findProfileIdByEmail(email: string) {
  return supabase
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();
}

// --- Friendships -----------------------------------------------------------

const friendshipSelect = 'id, user_id, friend_id, status, created_at';

export async function listAcceptedFriendships(userId: string) {
  return supabase
    .from('friendships')
    .select(friendshipSelect)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');
}

export async function listPendingRequestsForRecipient(userId: string) {
  return supabase
    .from('friendships')
    .select('id, user_id, created_at')
    .eq('friend_id', userId)
    .eq('status', 'pending');
}

// Existence check for a pair, in either direction
export async function findFriendshipBetween(userId: string, otherUserId: string) {
  return supabase
    .from('friendships')
    .select('id, status')
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${otherUserId}),` +
      `and(user_id.eq.${otherUserId},friend_id.eq.${userId})`
    )
    .maybeSingle();
}

export async function createFriendRequest(userId: string, friendId: string) {
  return supabase
    .from('friendships')
    .insert({
      user_id: userId,
      friend_id: friendId,
      status: 'pending',
    })
    .select('id')
    .single();
}

export async function findPendingRequestForRecipient(requestId: string, userId: string) {
  return supabase
    .from('friendships')
    .select('id')
    .eq('id', requestId)
    .eq('friend_id', userId)
    .eq('status', 'pending')
    .single();
}

export async function acceptFriendRequest(requestId: string) {
  return supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId);
}

export async function deletePendingRequestForRecipient(requestId: string, userId: string) {
  return supabase
    .from('friendships')
    .delete()
    .eq('id', requestId)
    .eq('friend_id', userId)
    .eq('status', 'pending');
}

export async function deleteFriendshipBetween(userId: string, friendId: string) {
  return supabase
    .from('friendships')
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
      `and(user_id.eq.${friendId},friend_id.eq.${userId})`
    );
}

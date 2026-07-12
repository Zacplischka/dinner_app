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

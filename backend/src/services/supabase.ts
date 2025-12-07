// Supabase client for backend operations
// Uses service role key for admin operations

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Create Supabase client with service role for backend operations
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Types for database tables
export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface SessionInvite {
  id: string;
  session_code: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
}

// Friend with profile info (for API responses)
export interface FriendWithProfile {
  friendship_id: string;
  friend_id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
}

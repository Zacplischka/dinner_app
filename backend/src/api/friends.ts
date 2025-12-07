// Friends API Router
// Handles user profiles, friendships, and session invites

import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabase, Profile } from '../services/supabase.js';
import type {
  UserProfile,
  Friend,
  FriendRequest,
  SessionInvite,
  SendFriendRequestPayload,
  InviteToSessionPayload,
  SearchUsersResponse,
  FriendsListResponse,
  FriendRequestsResponse,
  SessionInvitesResponse,
} from '@dinner-app/shared/types';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// USER PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/users/me
 * Get the current user's profile
 */
router.get('/users/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // Profile might not exist yet - create it from auth data
      if (error.code === 'PGRST116') {
        // Fetch full user data from Supabase Auth to get Google profile info
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        const metadata = authUser?.user?.user_metadata;

        const newProfile = {
          id: userId,
          email: req.user!.email || null,
          display_name: metadata?.full_name || metadata?.name || req.user!.email?.split('@')[0] || 'User',
          avatar_url: metadata?.avatar_url || metadata?.picture || null,
        };

        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();

        if (createError) {
          console.error('Error creating profile:', createError);
          return res.status(500).json({
            error: 'database_error',
            message: 'Failed to create user profile',
          });
        }

        return res.json(mapProfileToUserProfile(created));
      }

      console.error('Error fetching profile:', error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch user profile',
      });
    }

    return res.json(mapProfileToUserProfile(profile));
  } catch (error) {
    console.error('Error in GET /users/me:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/users/search?email=<email>
 * Search for users by exact email match
 */
router.get('/users/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.query;
    const userId = req.user!.id;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email query parameter is required',
      });
    }

    // Exact email match only (privacy protection)
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .neq('id', userId) // Don't return the current user
      .limit(10);

    if (error) {
      console.error('Error searching users:', error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to search users',
      });
    }

    const response: SearchUsersResponse = {
      users: (users || []).map(mapProfileToUserProfile),
    };

    return res.json(response);
  } catch (error) {
    console.error('Error in GET /users/search:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// FRIENDS ENDPOINTS
// ============================================================================

/**
 * GET /api/friends
 * List all accepted friends for the current user
 */
router.get('/friends', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get friendships where the user is either user_id or friend_id
    // and status is 'accepted'
    const { data: friendships, error } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at
      `)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error fetching friendships:', error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch friends',
      });
    }

    // Get the IDs of friends (the "other" person in each friendship)
    const friendIds = friendships.map((f) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    if (friendIds.length === 0) {
      return res.json({ friends: [] } as FriendsListResponse);
    }

    // Fetch profiles for all friends
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds);

    if (profilesError) {
      console.error('Error fetching friend profiles:', profilesError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch friend profiles',
      });
    }

    // Map friendships to Friend objects
    const friends: Friend[] = friendships.map((friendship) => {
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

    const response: FriendsListResponse = { friends };
    return res.json(response);
  } catch (error) {
    console.error('Error in GET /friends:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/friends/requests
 * List pending friend requests for the current user (requests they received)
 */
router.get('/friends/requests', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get pending requests where the current user is the recipient (friend_id)
    const { data: requests, error } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        created_at
      `)
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching friend requests:', error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch friend requests',
      });
    }

    if (!requests || requests.length === 0) {
      return res.json({ requests: [] } as FriendRequestsResponse);
    }

    // Fetch profiles for all requesters
    const requesterIds = requests.map((r) => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', requesterIds);

    if (profilesError) {
      console.error('Error fetching requester profiles:', profilesError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch requester profiles',
      });
    }

    // Map to FriendRequest objects
    const friendRequests: FriendRequest[] = requests.map((request) => {
      const profile = profiles?.find((p) => p.id === request.user_id);

      return {
        id: request.id,
        fromUser: mapProfileToUserProfile(profile || {
          id: request.user_id,
          display_name: 'Unknown User',
          avatar_url: null,
          email: null,
        }),
        createdAt: request.created_at,
      };
    });

    const response: FriendRequestsResponse = { requests: friendRequests };
    return res.json(response);
  } catch (error) {
    console.error('Error in GET /friends/requests:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/friends/request
 * Send a friend request to a user by email
 */
router.post('/friends/request', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { email } = req.body as SendFriendRequestPayload;

    if (!email) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email is required',
      });
    }

    // Find the user by email
    const { data: targetUser, error: findError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (findError || !targetUser) {
      return res.status(404).json({
        error: 'not_found',
        message: 'User not found with that email',
      });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'You cannot send a friend request to yourself',
      });
    }

    // Check if a friendship already exists (in either direction)
    const { data: existingFriendship, error: checkError } = await supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${targetUser.id}),` +
        `and(user_id.eq.${targetUser.id},friend_id.eq.${userId})`
      )
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing friendship:', checkError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to check existing friendship',
      });
    }

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return res.status(400).json({
          error: 'already_friends',
          message: 'You are already friends with this user',
        });
      }
      if (existingFriendship.status === 'pending') {
        return res.status(400).json({
          error: 'request_pending',
          message: 'A friend request is already pending',
        });
      }
      if (existingFriendship.status === 'blocked') {
        return res.status(400).json({
          error: 'blocked',
          message: 'Unable to send friend request',
        });
      }
    }

    // Create the friend request
    const { data: newRequest, error: createError } = await supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: targetUser.id,
        status: 'pending',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating friend request:', createError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to create friend request',
      });
    }

    return res.status(201).json({
      success: true,
      requestId: newRequest.id,
      message: 'Friend request sent',
    });
  } catch (error) {
    console.error('Error in POST /friends/request:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/friends/:requestId/accept
 * Accept a friend request
 */
router.post('/friends/:requestId/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { requestId } = req.params;

    // Find the pending request where the current user is the recipient
    const { data: request, error: findError } = await supabase
      .from('friendships')
      .select('*')
      .eq('id', requestId)
      .eq('friend_id', userId)
      .eq('status', 'pending')
      .single();

    if (findError || !request) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Friend request not found',
      });
    }

    // Update the request to accepted
    const { error: updateError } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error accepting friend request:', updateError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to accept friend request',
      });
    }

    return res.json({
      success: true,
      message: 'Friend request accepted',
    });
  } catch (error) {
    console.error('Error in POST /friends/:requestId/accept:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/friends/:requestId/decline
 * Decline a friend request
 */
router.post('/friends/:requestId/decline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { requestId } = req.params;

    // Find and delete the pending request where the current user is the recipient
    const { error: deleteError } = await supabase
      .from('friendships')
      .delete()
      .eq('id', requestId)
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (deleteError) {
      console.error('Error declining friend request:', deleteError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to decline friend request',
      });
    }

    return res.json({
      success: true,
      message: 'Friend request declined',
    });
  } catch (error) {
    console.error('Error in POST /friends/:requestId/decline:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * DELETE /api/friends/:friendId
 * Remove a friend (unfriend)
 */
router.delete('/friends/:friendId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { friendId } = req.params;

    // Delete the friendship in either direction
    const { error: deleteError } = await supabase
      .from('friendships')
      .delete()
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
        `and(user_id.eq.${friendId},friend_id.eq.${userId})`
      );

    if (deleteError) {
      console.error('Error removing friend:', deleteError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to remove friend',
      });
    }

    return res.json({
      success: true,
      message: 'Friend removed',
    });
  } catch (error) {
    console.error('Error in DELETE /friends/:friendId:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// SESSION INVITE ENDPOINTS
// ============================================================================

/**
 * POST /api/sessions/:code/invite
 * Invite friends to join a session
 */
router.post('/sessions/:code/invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { code } = req.params;
    const { friendIds } = req.body as InviteToSessionPayload;

    if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'At least one friend ID is required',
      });
    }

    // Verify all friend IDs are actually friends of the user
    const { data: friendships, error: friendError } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendError) {
      console.error('Error verifying friendships:', friendError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to verify friendships',
      });
    }

    const actualFriendIds = new Set(
      friendships.map((f) => (f.user_id === userId ? f.friend_id : f.user_id))
    );

    const validFriendIds = friendIds.filter((id) => actualFriendIds.has(id));

    if (validFriendIds.length === 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'No valid friend IDs provided',
      });
    }

    // Create session invites for each valid friend
    const invites = validFriendIds.map((friendId) => ({
      session_code: code,
      inviter_id: userId,
      invitee_id: friendId,
      status: 'pending' as const,
    }));

    // Use upsert to handle duplicate invites gracefully
    const { error: insertError } = await supabase
      .from('session_invites')
      .upsert(invites, {
        onConflict: 'session_code,inviter_id,invitee_id',
        ignoreDuplicates: true,
      });

    if (insertError) {
      // If upsert fails, try inserting individually (ignoring duplicates)
      console.warn('Upsert failed, trying individual inserts:', insertError);

      for (const invite of invites) {
        await supabase
          .from('session_invites')
          .insert(invite)
          .select()
          .maybeSingle();
      }
    }

    return res.status(201).json({
      success: true,
      invitedCount: validFriendIds.length,
      message: `Invited ${validFriendIds.length} friend(s) to session`,
    });
  } catch (error) {
    console.error('Error in POST /sessions/:code/invite:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/invites
 * Get session invites for the current user
 */
router.get('/invites', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get pending invites where the current user is the invitee
    const { data: invites, error } = await supabase
      .from('session_invites')
      .select('*')
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invites:', error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to fetch session invites',
      });
    }

    if (!invites || invites.length === 0) {
      return res.json({ invites: [] } as SessionInvitesResponse);
    }

    // Fetch inviter profiles
    const inviterIds = [...new Set(invites.map((i) => i.inviter_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', inviterIds);

    if (profilesError) {
      console.error('Error fetching inviter profiles:', profilesError);
    }

    // Map to SessionInvite objects
    const sessionInvites: SessionInvite[] = invites.map((invite) => {
      const profile = profiles?.find((p) => p.id === invite.inviter_id);

      return {
        id: invite.id,
        sessionCode: invite.session_code,
        inviter: mapProfileToUserProfile(profile || {
          id: invite.inviter_id,
          display_name: 'Unknown User',
          avatar_url: null,
          email: null,
        }),
        status: invite.status,
        createdAt: invite.created_at,
      };
    });

    const response: SessionInvitesResponse = { invites: sessionInvites };
    return res.json(response);
  } catch (error) {
    console.error('Error in GET /invites:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/invites/:inviteId/accept
 * Accept a session invite
 */
router.post('/invites/:inviteId/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { inviteId } = req.params;

    // Find and update the invite
    const { data: invite, error: updateError } = await supabase
      .from('session_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId)
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateError || !invite) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Session invite not found',
      });
    }

    return res.json({
      success: true,
      sessionCode: invite.session_code,
      message: 'Session invite accepted',
    });
  } catch (error) {
    console.error('Error in POST /invites/:inviteId/accept:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/invites/:inviteId/decline
 * Decline a session invite
 */
router.post('/invites/:inviteId/decline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { inviteId } = req.params;

    // Find and update the invite
    const { error: updateError } = await supabase
      .from('session_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId)
      .eq('invitee_id', userId)
      .eq('status', 'pending');

    if (updateError) {
      console.error('Error declining invite:', updateError);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to decline invite',
      });
    }

    return res.json({
      success: true,
      message: 'Session invite declined',
    });
  } catch (error) {
    console.error('Error in POST /invites/:inviteId/decline:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map a database Profile to a UserProfile API response object
 */
function mapProfileToUserProfile(profile: Partial<Profile>): UserProfile {
  return {
    id: profile.id || '',
    displayName: profile.display_name || 'Unknown User',
    avatarUrl: profile.avatar_url || null,
    email: profile.email || null,
  };
}

export default router;

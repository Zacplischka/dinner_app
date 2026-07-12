// Friends API Router
// Handles user profiles, friendships, and session invites

import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { DomainError } from '../services/DomainError.js';
import * as FriendsService from '../services/FriendsService.js';
import * as friendsStore from '../store/friendsStore.js';
import type {
  SessionInvite,
  SendFriendRequestPayload,
  InviteToSessionPayload,
  SearchUsersResponse,
  FriendsListResponse,
  FriendRequestsResponse,
  SessionInvitesResponse,
} from '@dinder/shared/types';

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
router.get('/users/me', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const profile = await FriendsService.getCurrentProfile(req.user!.id, req.user!.email);
  return res.json(profile);
}));

/**
 * GET /api/users/search?email=<email>
 * Search for users by exact email match
 */
router.get('/users/search', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Email query parameter is required',
    });
  }

  const users = await FriendsService.searchUsers(email, req.user!.id);
  const response: SearchUsersResponse = { users };
  return res.json(response);
}));

// ============================================================================
// FRIENDS ENDPOINTS
// ============================================================================

/**
 * GET /api/friends
 * List all accepted friends for the current user
 */
router.get('/friends', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const friends = await FriendsService.listFriends(req.user!.id);
  const response: FriendsListResponse = { friends };
  return res.json(response);
}));

/**
 * GET /api/friends/requests
 * List pending friend requests for the current user (requests they received)
 */
router.get('/friends/requests', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const requests = await FriendsService.listFriendRequests(req.user!.id);
  const response: FriendRequestsResponse = { requests };
  return res.json(response);
}));

/**
 * POST /api/friends/request
 * Send a friend request to a user by email
 */
router.post('/friends/request', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.body as SendFriendRequestPayload;

  if (!email) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Email is required',
    });
  }

  const requestId = await FriendsService.sendFriendRequest(req.user!.id, email);

  return res.status(201).json({
    success: true,
    requestId,
    message: 'Friend request sent',
  });
}));

/**
 * POST /api/friends/:requestId/accept
 * Accept a friend request
 */
router.post('/friends/:requestId/accept', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await FriendsService.acceptFriendRequest(req.user!.id, req.params.requestId);

  return res.json({
    success: true,
    message: 'Friend request accepted',
  });
}));

/**
 * POST /api/friends/:requestId/decline
 * Decline a friend request
 */
router.post('/friends/:requestId/decline', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await FriendsService.declineFriendRequest(req.user!.id, req.params.requestId);

  return res.json({
    success: true,
    message: 'Friend request declined',
  });
}));

/**
 * DELETE /api/friends/:friendId
 * Remove a friend (unfriend)
 */
router.delete('/friends/:friendId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await FriendsService.removeFriend(req.user!.id, req.params.friendId);

  return res.json({
    success: true,
    message: 'Friend removed',
  });
}));

// ============================================================================
// SESSION INVITE ENDPOINTS
// ============================================================================

/**
 * POST /api/sessions/:code/invite
 * Invite friends to join a session
 */
router.post('/sessions/:code/invite', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
    const { data: friendships, error: friendError } = await friendsStore.listAcceptedFriendPairs(userId);

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

    await friendsStore.createSessionInvites(invites);

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
}));

/**
 * GET /api/invites
 * Get session invites for the current user
 */
router.get('/invites', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get pending invites where the current user is the invitee
    const { data: invites, error } = await friendsStore.listPendingInvitesForInvitee(userId);

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

    // Fetch inviter profiles; a failed lookup falls back to placeholder profiles
    const inviterIds = [...new Set(invites.map((i) => i.inviter_id))];
    const profiles = await friendsStore.listProfilesByIds(inviterIds);

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
}));

/**
 * POST /api/invites/:inviteId/accept
 * Accept a session invite
 */
router.post('/invites/:inviteId/accept', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { inviteId } = req.params;

    // Find and update the invite
    const { data: invite, error: updateError } = await friendsStore.acceptSessionInvite(inviteId, userId);

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
}));

/**
 * POST /api/invites/:inviteId/decline
 * Decline a session invite
 */
router.post('/invites/:inviteId/decline', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { inviteId } = req.params;

    // Find and update the invite
    const { error: updateError } = await friendsStore.declineSessionInvite(inviteId, userId);

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
}));

// ============================================================================
// ERROR MAPPING
// ============================================================================

const mapProfileToUserProfile = FriendsService.mapProfileToUserProfile;

const statusByCode: Record<string, number> = {
  not_found: 404,
  database_error: 500,
};

// Maps typed domain errors to HTTP; anything unexpected becomes a 500.
// The asyncHandler wrapper on every route delivers thrown errors here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof DomainError) {
    return res.status(statusByCode[err.code] ?? 400).json({
      error: err.code,
      message: err.message,
    });
  }

  console.error('Unhandled friends API error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
  });
});

export default router;

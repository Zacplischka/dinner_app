// Friends API Router
// Handles user profiles, friendships, and session invites

import { Router, Response } from 'express';
import { asyncHandler } from './asyncHandler.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import type { FriendsService } from '../services/FriendsService.js';
import type {
  SendFriendRequestPayload,
  InviteToSessionPayload,
  SearchUsersResponse,
  FriendsListResponse,
  FriendRequestsResponse,
  SessionInvitesResponse,
} from '@dinder/shared/types';

export function createFriendsRouter(friendsService: FriendsService) {
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
  router.get(
    '/users/me',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const profile = await friendsService.getCurrentProfile(req.user!.id, req.user!.email);
      return res.json(profile);
    })
  );

  /**
   * GET /api/users/search?email=<email>
   * Search for users by exact email match
   */
  router.get(
    '/users/search',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Email query parameter is required',
        });
      }

      const users = await friendsService.searchUsers(email, req.user!.id);
      const response: SearchUsersResponse = { users };
      return res.json(response);
    })
  );

  // ============================================================================
  // FRIENDS ENDPOINTS
  // ============================================================================

  /**
   * GET /api/friends
   * List all accepted friends for the current user
   */
  router.get(
    '/friends',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const friends = await friendsService.listFriends(req.user!.id);
      const response: FriendsListResponse = { friends };
      return res.json(response);
    })
  );

  /**
   * GET /api/friends/requests
   * List pending friend requests for the current user (requests they received)
   */
  router.get(
    '/friends/requests',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const requests = await friendsService.listFriendRequests(req.user!.id);
      const response: FriendRequestsResponse = { requests };
      return res.json(response);
    })
  );

  /**
   * POST /api/friends/request
   * Send a friend request to a user by email
   */
  router.post(
    '/friends/request',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { email } = req.body as SendFriendRequestPayload;

      if (!email) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Email is required',
        });
      }

      const requestId = await friendsService.sendFriendRequest(req.user!.id, email);

      return res.status(201).json({
        success: true,
        requestId,
        message: 'Friend request sent',
      });
    })
  );

  /**
   * POST /api/friends/:requestId/accept
   * Accept a friend request
   */
  router.post(
    '/friends/:requestId/accept',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      await friendsService.acceptFriendRequest(req.user!.id, req.params.requestId);

      return res.json({
        success: true,
        message: 'Friend request accepted',
      });
    })
  );

  /**
   * POST /api/friends/:requestId/decline
   * Decline a friend request
   */
  router.post(
    '/friends/:requestId/decline',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      await friendsService.declineFriendRequest(req.user!.id, req.params.requestId);

      return res.json({
        success: true,
        message: 'Friend request declined',
      });
    })
  );

  /**
   * DELETE /api/friends/:friendId
   * Remove a friend (unfriend)
   */
  router.delete(
    '/friends/:friendId',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      await friendsService.removeFriend(req.user!.id, req.params.friendId);

      return res.json({
        success: true,
        message: 'Friend removed',
      });
    })
  );

  // ============================================================================
  // SESSION INVITE ENDPOINTS
  // ============================================================================

  /**
   * POST /api/sessions/:code/invite
   * Invite friends to join a session
   */
  router.post(
    '/sessions/:code/invite',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { friendIds } = req.body as InviteToSessionPayload;

      if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'At least one friend ID is required',
        });
      }

      const invitedCount = await friendsService.inviteFriendsToSession(
        req.user!.id,
        req.params.code,
        friendIds
      );

      return res.status(201).json({
        success: true,
        invitedCount,
        message: `Invited ${invitedCount} friend(s) to session`,
      });
    })
  );

  /**
   * GET /api/invites
   * Get session invites for the current user
   */
  router.get(
    '/invites',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const invites = await friendsService.listSessionInvites(req.user!.id);
      const response: SessionInvitesResponse = { invites };
      return res.json(response);
    })
  );

  /**
   * POST /api/invites/:inviteId/accept
   * Accept a session invite
   */
  router.post(
    '/invites/:inviteId/accept',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const sessionCode = await friendsService.acceptSessionInvite(
        req.user!.id,
        req.params.inviteId
      );

      return res.json({
        success: true,
        sessionCode,
        message: 'Session invite accepted',
      });
    })
  );

  /**
   * POST /api/invites/:inviteId/decline
   * Decline a session invite
   */
  router.post(
    '/invites/:inviteId/decline',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      await friendsService.declineSessionInvite(req.user!.id, req.params.inviteId);

      return res.json({
        success: true,
        message: 'Session invite declined',
      });
    })
  );

  // Thrown DomainErrors propagate (via asyncHandler → next) to the app-level
  // errorHandler, which owns the single private→public transport mapping.
  return router;
}

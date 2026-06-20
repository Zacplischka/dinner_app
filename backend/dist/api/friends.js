import { Router } from 'express';
import { getAuthProfileDefaults } from './authMetadata.js';
import { asyncHandler } from './asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
const router = Router();
const profileSelect = 'id, display_name, avatar_url, email';
const friendshipSelect = 'id, user_id, friend_id, status, created_at';
const sessionInviteSelect = 'id, session_code, inviter_id, status, created_at';
router.use(requireAuth);
router.get('/users/me', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(profileSelect)
            .eq('id', userId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                const { data: authUser } = await supabase.auth.admin.getUserById(userId);
                const metadata = authUser?.user?.user_metadata;
                const profileDefaults = getAuthProfileDefaults(metadata, req.user.email);
                const newProfile = {
                    id: userId,
                    email: req.user.email || null,
                    display_name: profileDefaults.displayName,
                    avatar_url: profileDefaults.avatarUrl,
                };
                const { data: created, error: createError } = await supabase
                    .from('profiles')
                    .insert(newProfile)
                    .select(profileSelect)
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
    }
    catch (error) {
        console.error('Error in GET /users/me:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.get('/users/search', asyncHandler(async (req, res) => {
    try {
        const { email } = req.query;
        const userId = req.user.id;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Email query parameter is required',
            });
        }
        const { data: users, error } = await supabase
            .from('profiles')
            .select(profileSelect)
            .eq('email', email.toLowerCase())
            .neq('id', userId)
            .limit(10);
        if (error) {
            console.error('Error searching users:', error);
            return res.status(500).json({
                error: 'database_error',
                message: 'Failed to search users',
            });
        }
        const response = {
            users: (users || []).map(mapProfileToUserProfile),
        };
        return res.json(response);
    }
    catch (error) {
        console.error('Error in GET /users/search:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.get('/friends', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: friendships, error } = await supabase
            .from('friendships')
            .select(friendshipSelect)
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
            .eq('status', 'accepted');
        if (error) {
            console.error('Error fetching friendships:', error);
            return res.status(500).json({
                error: 'database_error',
                message: 'Failed to fetch friends',
            });
        }
        const friendIds = friendships.map((f) => f.user_id === userId ? f.friend_id : f.user_id);
        if (friendIds.length === 0) {
            return res.json({ friends: [] });
        }
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select(profileSelect)
            .in('id', friendIds);
        if (profilesError) {
            console.error('Error fetching friend profiles:', profilesError);
            return res.status(500).json({
                error: 'database_error',
                message: 'Failed to fetch friend profiles',
            });
        }
        const friends = friendships.map((friendship) => {
            const friendId = friendship.user_id === userId ? friendship.friend_id : friendship.user_id;
            const profile = profiles.find((p) => p.id === friendId);
            return {
                id: friendId,
                friendshipId: friendship.id,
                displayName: profile?.display_name || 'Unknown User',
                avatarUrl: profile?.avatar_url || null,
                email: profile?.email || null,
                status: 'accepted',
            };
        });
        const response = { friends };
        return res.json(response);
    }
    catch (error) {
        console.error('Error in GET /friends:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.get('/friends/requests', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
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
            return res.json({ requests: [] });
        }
        const requesterIds = requests.map((r) => r.user_id);
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select(profileSelect)
            .in('id', requesterIds);
        if (profilesError) {
            console.error('Error fetching requester profiles:', profilesError);
            return res.status(500).json({
                error: 'database_error',
                message: 'Failed to fetch requester profiles',
            });
        }
        const friendRequests = requests.map((request) => {
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
        const response = { requests: friendRequests };
        return res.json(response);
    }
    catch (error) {
        console.error('Error in GET /friends/requests:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/friends/request', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Email is required',
            });
        }
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
        const { data: existingFriendship, error: checkError } = await supabase
            .from('friendships')
            .select('id, status')
            .or(`and(user_id.eq.${userId},friend_id.eq.${targetUser.id}),` +
            `and(user_id.eq.${targetUser.id},friend_id.eq.${userId})`)
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
        const { data: newRequest, error: createError } = await supabase
            .from('friendships')
            .insert({
            user_id: userId,
            friend_id: targetUser.id,
            status: 'pending',
        })
            .select('id')
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
    }
    catch (error) {
        console.error('Error in POST /friends/request:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/friends/:requestId/accept', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { requestId } = req.params;
        const { data: request, error: findError } = await supabase
            .from('friendships')
            .select('id')
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
    }
    catch (error) {
        console.error('Error in POST /friends/:requestId/accept:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/friends/:requestId/decline', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { requestId } = req.params;
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
    }
    catch (error) {
        console.error('Error in POST /friends/:requestId/decline:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.delete('/friends/:friendId', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.params;
        const { error: deleteError } = await supabase
            .from('friendships')
            .delete()
            .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
            `and(user_id.eq.${friendId},friend_id.eq.${userId})`);
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
    }
    catch (error) {
        console.error('Error in DELETE /friends/:friendId:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/sessions/:code/invite', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { code } = req.params;
        const { friendIds } = req.body;
        if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'At least one friend ID is required',
            });
        }
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
        const actualFriendIds = new Set(friendships.map((f) => (f.user_id === userId ? f.friend_id : f.user_id)));
        const validFriendIds = friendIds.filter((id) => actualFriendIds.has(id));
        if (validFriendIds.length === 0) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'No valid friend IDs provided',
            });
        }
        const invites = validFriendIds.map((friendId) => ({
            session_code: code,
            inviter_id: userId,
            invitee_id: friendId,
            status: 'pending',
        }));
        const { error: insertError } = await supabase
            .from('session_invites')
            .upsert(invites, {
            onConflict: 'session_code,inviter_id,invitee_id',
            ignoreDuplicates: true,
        });
        if (insertError) {
            console.warn('Upsert failed, trying individual inserts:', insertError);
            for (const invite of invites) {
                await supabase
                    .from('session_invites')
                    .insert(invite);
            }
        }
        return res.status(201).json({
            success: true,
            invitedCount: validFriendIds.length,
            message: `Invited ${validFriendIds.length} friend(s) to session`,
        });
    }
    catch (error) {
        console.error('Error in POST /sessions/:code/invite:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.get('/invites', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: invites, error } = await supabase
            .from('session_invites')
            .select(sessionInviteSelect)
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
            return res.json({ invites: [] });
        }
        const inviterIds = [...new Set(invites.map((i) => i.inviter_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select(profileSelect)
            .in('id', inviterIds);
        if (profilesError) {
            console.error('Error fetching inviter profiles:', profilesError);
        }
        const sessionInvites = invites.map((invite) => {
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
        const response = { invites: sessionInvites };
        return res.json(response);
    }
    catch (error) {
        console.error('Error in GET /invites:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/invites/:inviteId/accept', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { inviteId } = req.params;
        const { data: invite, error: updateError } = await supabase
            .from('session_invites')
            .update({ status: 'accepted' })
            .eq('id', inviteId)
            .eq('invitee_id', userId)
            .eq('status', 'pending')
            .select('session_code')
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
    }
    catch (error) {
        console.error('Error in POST /invites/:inviteId/accept:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
router.post('/invites/:inviteId/decline', asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const { inviteId } = req.params;
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
    }
    catch (error) {
        console.error('Error in POST /invites/:inviteId/decline:', error);
        return res.status(500).json({
            error: 'internal_error',
            message: 'An unexpected error occurred',
        });
    }
}));
function mapProfileToUserProfile(profile) {
    return {
        id: profile.id || '',
        displayName: profile.display_name || 'Unknown User',
        avatarUrl: profile.avatar_url || null,
        email: profile.email || null,
    };
}
export default router;
//# sourceMappingURL=friends.js.map
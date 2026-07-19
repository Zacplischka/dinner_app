import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/services/DomainError.js';
import { createFriendsService } from '../../src/services/FriendsService.js';
import type { UserProfile } from '@dinder/shared/types';

// In-memory fake of FriendsStore: plain Maps of profiles/friendships/invites.
// Rows stay snake_case inside the fake (like the real store); every read
// function maps them to the camelCase values the store boundary guarantees.
// Tests assert on FriendsService behavior only - never on which queries ran.

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
};

type InviteRow = {
  id: string;
  session_code: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
};

// Mirrors the real store's row→wire mapping, fallbacks included.
function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id || '',
    displayName: row.display_name || 'Unknown User',
    avatarUrl: row.avatar_url || null,
    email: row.email || null,
  };
}

const db = {
  profiles: new Map<string, ProfileRow>(),
  friendships: new Map<string, FriendshipRow>(),
  invites: new Map<string, InviteRow>(),
  authMetadata: new Map<string, unknown>(),
  nextId: 1,
};

const fakeStore = {
  getProfileById: async (userId: string) => {
    const row = db.profiles.get(userId);
    return row ? toUserProfile(row) : null;
  },

  getAuthUserMetadata: async (userId: string) => db.authMetadata.get(userId),

  createProfile: async (profile: {
    id: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
  }) => {
    const row: ProfileRow = {
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    };
    db.profiles.set(row.id, row);
    return toUserProfile(row);
  },

  searchProfilesByEmail: async (email: string, excludeUserId: string) =>
    [...db.profiles.values()]
      .filter((p) => p.email === email.toLowerCase() && p.id !== excludeUserId)
      .map(toUserProfile),

  listProfilesByIds: async (ids: string[]) =>
    [...db.profiles.values()].filter((p) => ids.includes(p.id)).map(toUserProfile),

  findProfileIdByEmail: async (email: string) => {
    const profile = [...db.profiles.values()].find((p) => p.email === email.toLowerCase());
    return profile ? { id: profile.id } : null;
  },

  listAcceptedFriendships: async (userId: string) =>
    [...db.friendships.values()]
      .filter((f) => f.status === 'accepted' && (f.user_id === userId || f.friend_id === userId))
      .map(({ id, user_id, friend_id }) => ({ id, userId: user_id, friendId: friend_id })),

  listAcceptedFriendPairs: async (userId: string) =>
    [...db.friendships.values()]
      .filter((f) => f.status === 'accepted' && (f.user_id === userId || f.friend_id === userId))
      .map(({ user_id, friend_id }) => ({ user_id, friend_id })),

  listPendingRequestsForRecipient: async (userId: string) =>
    [...db.friendships.values()]
      .filter((f) => f.status === 'pending' && f.friend_id === userId)
      .map(({ id, user_id, created_at }) => ({ id, fromUserId: user_id, createdAt: created_at })),

  findFriendshipBetween: async (userId: string, otherUserId: string) => {
    const friendship = [...db.friendships.values()].find(
      (f) =>
        (f.user_id === userId && f.friend_id === otherUserId) ||
        (f.user_id === otherUserId && f.friend_id === userId)
    );
    return friendship ? { id: friendship.id, status: friendship.status } : null;
  },

  createFriendRequest: async (userId: string, friendId: string) => {
    const id = `friendship-${db.nextId++}`;
    db.friendships.set(id, {
      id,
      user_id: userId,
      friend_id: friendId,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    return { id };
  },

  findPendingRequestForRecipient: async (requestId: string, userId: string) => {
    const friendship = db.friendships.get(requestId);
    return friendship && friendship.friend_id === userId && friendship.status === 'pending'
      ? { id: friendship.id }
      : null;
  },

  acceptFriendRequest: async (requestId: string) => {
    const friendship = db.friendships.get(requestId);
    if (friendship) {
      friendship.status = 'accepted';
    }
  },

  deletePendingRequestForRecipient: async (requestId: string, userId: string) => {
    const friendship = db.friendships.get(requestId);
    if (friendship && friendship.friend_id === userId && friendship.status === 'pending') {
      db.friendships.delete(requestId);
    }
  },

  deleteFriendshipBetween: async (userId: string, friendId: string) => {
    for (const [id, f] of db.friendships) {
      if (
        (f.user_id === userId && f.friend_id === friendId) ||
        (f.user_id === friendId && f.friend_id === userId)
      ) {
        db.friendships.delete(id);
      }
    }
  },

  createSessionInvites: async (
    invites: Array<Pick<InviteRow, 'session_code' | 'inviter_id' | 'invitee_id' | 'status'>>
  ) => {
    for (const invite of invites) {
      const duplicate = [...db.invites.values()].some(
        (existing) =>
          existing.session_code === invite.session_code &&
          existing.inviter_id === invite.inviter_id &&
          existing.invitee_id === invite.invitee_id
      );
      if (!duplicate) {
        const id = `invite-${db.nextId++}`;
        db.invites.set(id, { ...invite, id, created_at: new Date().toISOString() });
      }
    }
  },

  listPendingInvitesForInvitee: async (userId: string) =>
    [...db.invites.values()]
      .filter((i) => i.status === 'pending' && i.invitee_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),

  acceptSessionInvite: async (inviteId: string, userId: string) => {
    const invite = db.invites.get(inviteId);
    if (invite && invite.invitee_id === userId && invite.status === 'pending') {
      invite.status = 'accepted';
      return { session_code: invite.session_code };
    }
    return null;
  },

  declineSessionInvite: async (inviteId: string, userId: string) => {
    const invite = db.invites.get(inviteId);
    if (invite && invite.invitee_id === userId && invite.status === 'pending') {
      invite.status = 'declined';
    }
  },
};

const FriendsService = createFriendsService({ store: fakeStore });

function addProfile(id: string, displayName: string, email: string) {
  db.profiles.set(id, {
    id,
    display_name: displayName,
    avatar_url: null,
    email,
  });
}

function addFriendship(
  id: string,
  userId: string,
  friendId: string,
  status: FriendshipRow['status']
) {
  db.friendships.set(id, {
    id,
    user_id: userId,
    friend_id: friendId,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

describe('FriendsService', () => {
  beforeEach(() => {
    db.profiles.clear();
    db.friendships.clear();
    db.invites.clear();
    db.authMetadata.clear();
    db.nextId = 1;
  });

  describe('getCurrentProfile', () => {
    it('returns the existing profile', async () => {
      addProfile('user-1', 'Alice', 'alice@example.com');

      const profile = await FriendsService.getCurrentProfile('user-1', 'alice@example.com');

      expect(profile).toEqual({
        id: 'user-1',
        displayName: 'Alice',
        avatarUrl: null,
        email: 'alice@example.com',
      });
    });

    it('creates a profile from auth metadata on first sight', async () => {
      db.authMetadata.set('user-1', {
        full_name: 'Alice Example',
        avatar_url: 'https://example.com/alice.png',
      });

      const profile = await FriendsService.getCurrentProfile('user-1', 'alice@example.com');

      expect(profile).toEqual({
        id: 'user-1',
        displayName: 'Alice Example',
        avatarUrl: 'https://example.com/alice.png',
        email: 'alice@example.com',
      });
      // Subsequent calls see the persisted profile
      await expect(
        FriendsService.getCurrentProfile('user-1', 'alice@example.com')
      ).resolves.toEqual(profile);
    });

    it('falls back to the email name when auth metadata has no name', async () => {
      const profile = await FriendsService.getCurrentProfile('user-1', 'alice@example.com');

      expect(profile.displayName).toBe('alice');
      expect(profile.avatarUrl).toBeNull();
    });
  });

  describe('searchUsers', () => {
    it('finds users by exact email, excluding the searcher', async () => {
      addProfile('user-1', 'Alice', 'alice@example.com');
      addProfile('user-2', 'Bob', 'bob@example.com');

      await expect(FriendsService.searchUsers('BOB@example.com', 'user-1'))
        .resolves.toEqual([
          { id: 'user-2', displayName: 'Bob', avatarUrl: null, email: 'bob@example.com' },
        ]);
      await expect(FriendsService.searchUsers('alice@example.com', 'user-1')).resolves.toEqual([]);
    });
  });

  describe('listFriends', () => {
    it('resolves the friend from either side of the friendship', async () => {
      addProfile('user-2', 'Bob', 'bob@example.com');
      addProfile('user-3', 'Cara', 'cara@example.com');
      addFriendship('friendship-1', 'user-1', 'user-2', 'accepted');
      addFriendship('friendship-2', 'user-3', 'user-1', 'accepted');

      const friends = await FriendsService.listFriends('user-1');

      expect(friends.map((f) => f.id).sort()).toEqual(['user-2', 'user-3']);
      expect(friends.every((f) => f.status === 'accepted')).toBe(true);
    });

    it('excludes pending friendships and returns [] when there are none', async () => {
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('friendship-1', 'user-1', 'user-2', 'pending');

      await expect(FriendsService.listFriends('user-1')).resolves.toEqual([]);
    });
  });

  describe('listFriendRequests', () => {
    it('lists only requests the user received, with sender profile', async () => {
      addProfile('user-2', 'Bob', 'bob@example.com');
      addProfile('user-3', 'Cara', 'cara@example.com');
      addFriendship('request-in', 'user-2', 'user-1', 'pending');
      addFriendship('request-out', 'user-1', 'user-3', 'pending');

      const requests = await FriendsService.listFriendRequests('user-1');

      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe('request-in');
      expect(requests[0].fromUser.displayName).toBe('Bob');
    });
  });

  describe('sendFriendRequest', () => {
    beforeEach(() => {
      addProfile('user-1', 'Alice', 'alice@example.com');
      addProfile('user-2', 'Bob', 'bob@example.com');
    });

    it('creates a pending request visible to the recipient', async () => {
      await FriendsService.sendFriendRequest('user-1', 'bob@example.com');

      const requests = await FriendsService.listFriendRequests('user-2');
      expect(requests).toHaveLength(1);
      expect(requests[0].fromUser.id).toBe('user-1');
    });

    it('rejects unknown emails', async () => {
      await expect(
        FriendsService.sendFriendRequest('user-1', 'missing@example.com')
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('rejects self-friending', async () => {
      await expect(
        FriendsService.sendFriendRequest('user-1', 'alice@example.com')
      ).rejects.toMatchObject({ code: 'validation_error' });
    });

    it.each([
      ['accepted', 'already_friends'],
      ['pending', 'request_pending'],
      ['blocked', 'blocked'],
    ] as const)('rejects when a %s friendship already exists', async (status, code) => {
      addFriendship('friendship-1', 'user-2', 'user-1', status);

      const attempt = FriendsService.sendFriendRequest('user-1', 'bob@example.com');

      await expect(attempt).rejects.toBeInstanceOf(DomainError);
      await expect(attempt).rejects.toMatchObject({ code });
    });
  });

  describe('acceptFriendRequest', () => {
    beforeEach(() => {
      addProfile('user-1', 'Alice', 'alice@example.com');
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('request-1', 'user-2', 'user-1', 'pending');
    });

    it('lets the recipient accept, making both users friends', async () => {
      await FriendsService.acceptFriendRequest('user-1', 'request-1');

      await expect(FriendsService.listFriends('user-1')).resolves.toMatchObject([
        { id: 'user-2' },
      ]);
      await expect(FriendsService.listFriends('user-2')).resolves.toMatchObject([
        { id: 'user-1' },
      ]);
    });

    it('does not let the sender accept their own request', async () => {
      await expect(
        FriendsService.acceptFriendRequest('user-2', 'request-1')
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('rejects accepting an already-accepted request', async () => {
      await FriendsService.acceptFriendRequest('user-1', 'request-1');

      await expect(
        FriendsService.acceptFriendRequest('user-1', 'request-1')
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  describe('declineFriendRequest', () => {
    beforeEach(() => {
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('request-1', 'user-2', 'user-1', 'pending');
    });

    it('removes the pending request for the recipient', async () => {
      await FriendsService.declineFriendRequest('user-1', 'request-1');

      await expect(FriendsService.listFriendRequests('user-1')).resolves.toEqual([]);
    });

    it('leaves the request intact when someone else declines it', async () => {
      await FriendsService.declineFriendRequest('user-2', 'request-1');

      const requests = await FriendsService.listFriendRequests('user-1');
      expect(requests).toHaveLength(1);
    });
  });

  describe('removeFriend', () => {
    it('removes the friendship regardless of direction', async () => {
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('friendship-1', 'user-2', 'user-1', 'accepted');

      await FriendsService.removeFriend('user-1', 'user-2');

      await expect(FriendsService.listFriends('user-1')).resolves.toEqual([]);
      await expect(FriendsService.listFriends('user-2')).resolves.toEqual([]);
    });
  });

  describe('inviteFriendsToSession', () => {
    beforeEach(() => {
      addProfile('user-1', 'Alice', 'alice@example.com');
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('friendship-1', 'user-1', 'user-2', 'accepted');
    });

    it('invites only accepted friends and reports the invited count', async () => {
      const invitedCount = await FriendsService.inviteFriendsToSession('user-1', 'AB123', [
        'user-2',
        'user-4',
      ]);

      expect(invitedCount).toBe(1);
      const invites = await FriendsService.listSessionInvites('user-2');
      expect(invites).toMatchObject([
        { sessionCode: 'AB123', inviter: { id: 'user-1', displayName: 'Alice' } },
      ]);
    });

    it('rejects when no provided id is a friend', async () => {
      await expect(
        FriendsService.inviteFriendsToSession('user-1', 'AB123', ['user-4'])
      ).rejects.toMatchObject({ code: 'validation_error' });
    });
  });

  describe('session invite transitions', () => {
    let inviteId: string;

    beforeEach(async () => {
      addProfile('user-1', 'Alice', 'alice@example.com');
      addProfile('user-2', 'Bob', 'bob@example.com');
      addFriendship('friendship-1', 'user-1', 'user-2', 'accepted');
      await FriendsService.inviteFriendsToSession('user-1', 'AB123', ['user-2']);
      const invites = await FriendsService.listSessionInvites('user-2');
      inviteId = invites[0].id;
    });

    it('accept returns the session code and removes the pending invite', async () => {
      await expect(FriendsService.acceptSessionInvite('user-2', inviteId)).resolves.toBe(
        'AB123'
      );
      await expect(FriendsService.listSessionInvites('user-2')).resolves.toEqual([]);
    });

    it('rejects accepting an invite twice', async () => {
      await FriendsService.acceptSessionInvite('user-2', inviteId);

      await expect(
        FriendsService.acceptSessionInvite('user-2', inviteId)
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('does not let anyone but the invitee accept', async () => {
      await expect(
        FriendsService.acceptSessionInvite('user-1', inviteId)
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('decline removes the invite from the pending list', async () => {
      await FriendsService.declineSessionInvite('user-2', inviteId);

      await expect(FriendsService.listSessionInvites('user-2')).resolves.toEqual([]);
    });
  });
});

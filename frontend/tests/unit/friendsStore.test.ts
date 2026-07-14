import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';

const profile = {
  id: 'user-1',
  displayName: 'Alice',
  avatarUrl: null,
  email: 'alice@example.com',
};

const friend = {
  id: 'user-2',
  friendshipId: 'friendship-1',
  displayName: 'Bob',
  avatarUrl: null,
  email: 'bob@example.com',
  status: 'accepted' as const,
};

const request = {
  id: 'request-1',
  fromUser: profile,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const invite = {
  id: 'invite-1',
  sessionCode: 'AB123',
  inviter: profile,
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function response(data: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

describe('friendsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFriendsStore.getState().reset();
    useAuthStore.setState({
      session: { access_token: 'token' } as any,
      user: { id: 'user-1' } as any,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch profile, friends, requests, invites, and search results', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response(profile))
      .mockResolvedValueOnce(response({ friends: [friend] }))
      .mockResolvedValueOnce(response({ requests: [request] }))
      .mockResolvedValueOnce(response({ invites: [invite] }))
      .mockResolvedValueOnce(response({ users: [profile] }));

    await useFriendsStore.getState().fetchCurrentProfile();
    await useFriendsStore.getState().fetchFriends();
    await useFriendsStore.getState().fetchFriendRequests();
    await useFriendsStore.getState().fetchSessionInvites();
    const users = await useFriendsStore.getState().searchUsers('alice@example.com');

    expect(users).toEqual([profile]);
    expect(useFriendsStore.getState()).toMatchObject({
      currentUserProfile: profile,
      friends: [friend],
      friendRequests: [request],
      sessionInvites: [invite],
      searchResults: [profile],
      error: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    );
  });

  it('should send, remove, accept, decline, invite, and reset local state', async () => {
    useFriendsStore.setState({
      friends: [friend],
      friendRequests: [request],
      sessionInvites: [invite],
      searchResults: [profile],
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ friends: [friend] }))
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ success: true, sessionCode: 'AB123' }))
      .mockResolvedValueOnce(response({ success: true }));

    await expect(useFriendsStore.getState().sendFriendRequest('bob@example.com')).resolves.toBe(true);
    expect(useFriendsStore.getState().searchResults).toEqual([]);

    await expect(useFriendsStore.getState().removeFriend('user-2')).resolves.toBe(true);
    expect(useFriendsStore.getState().friends).toEqual([]);

    await expect(useFriendsStore.getState().acceptFriendRequest('request-1')).resolves.toBe(true);
    expect(useFriendsStore.getState().friendRequests).toEqual([]);

    useFriendsStore.setState({ friendRequests: [request] });
    await expect(useFriendsStore.getState().declineFriendRequest('request-1')).resolves.toBe(true);
    expect(useFriendsStore.getState().friendRequests).toEqual([]);

    await expect(useFriendsStore.getState().inviteFriendsToSession('AB123', ['user-2'])).resolves.toBe(true);

    await expect(useFriendsStore.getState().acceptSessionInvite('invite-1')).resolves.toEqual({
      success: true,
      sessionCode: 'AB123',
    });
    expect(useFriendsStore.getState().sessionInvites).toEqual([]);

    useFriendsStore.setState({ sessionInvites: [invite] });
    await expect(useFriendsStore.getState().declineSessionInvite('invite-1')).resolves.toBe(true);
    expect(useFriendsStore.getState().sessionInvites).toEqual([]);

    useFriendsStore.getState().clearError();
    useFriendsStore.getState().reset();
    expect(useFriendsStore.getState().friends).toEqual([]);
  });

  it('should store errors and return failure values when requests fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn().mockResolvedValue(response({ message: 'failed' }, false, 500));

    await useFriendsStore.getState().fetchCurrentProfile();
    await useFriendsStore.getState().fetchFriends();
    await useFriendsStore.getState().fetchFriendRequests();
    await useFriendsStore.getState().fetchSessionInvites();
    await expect(useFriendsStore.getState().searchUsers('x@example.com')).resolves.toEqual([]);
    await expect(useFriendsStore.getState().sendFriendRequest('x@example.com')).resolves.toBe(false);
    await expect(useFriendsStore.getState().removeFriend('user-2')).resolves.toBe(false);
    await expect(useFriendsStore.getState().acceptFriendRequest('request-1')).resolves.toBe(false);
    await expect(useFriendsStore.getState().declineFriendRequest('request-1')).resolves.toBe(false);
    await expect(useFriendsStore.getState().inviteFriendsToSession('AB123', ['user-2'])).resolves.toBe(false);
    await expect(useFriendsStore.getState().acceptSessionInvite('invite-1')).resolves.toEqual({ success: false });
    await expect(useFriendsStore.getState().declineSessionInvite('invite-1')).resolves.toBe(false);

    expect(useFriendsStore.getState().error).toBe('failed');
    expect(errorSpy).toHaveBeenCalledWith('Error fetching profile:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error fetching friends:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error fetching friend requests:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error fetching session invites:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error searching users:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error sending friend request:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error removing friend:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error accepting friend request:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error declining friend request:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error inviting friends to session:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error accepting session invite:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error declining session invite:', expect.any(Error));
  });

  it('should clear loading flags when requests fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn().mockRejectedValue(new Error('down'));

    await useFriendsStore.getState().fetchFriends();
    await useFriendsStore.getState().fetchFriendRequests();
    await useFriendsStore.getState().fetchSessionInvites();
    await useFriendsStore.getState().searchUsers('x@example.com');

    expect(useFriendsStore.getState()).toMatchObject({
      isLoadingFriends: false,
      isLoadingRequests: false,
      isLoadingInvites: false,
      isSearching: false,
    });
  });

  it('should use response and catch fallback messages', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 418,
      json: vi.fn(async () => ({})),
    } as unknown as Response);

    await useFriendsStore.getState().fetchCurrentProfile();
    expect(useFriendsStore.getState().error).toBe('HTTP error 418');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn(async () => {
        throw new Error('bad json');
      }),
    } as unknown as Response);

    await useFriendsStore.getState().fetchFriends();
    expect(useFriendsStore.getState().error).toBe('An error occurred');

    const fallbackCases: Array<{
      run: () => Promise<unknown>;
      expectedError: string;
      expectedResult?: unknown;
    }> = [
      {
        run: () => useFriendsStore.getState().fetchCurrentProfile(),
        expectedError: 'Failed to fetch profile',
      },
      {
        run: () => useFriendsStore.getState().fetchFriends(),
        expectedError: 'Failed to fetch friends',
      },
      {
        run: () => useFriendsStore.getState().searchUsers('x@example.com'),
        expectedError: 'Failed to search users',
        expectedResult: [],
      },
      {
        run: () => useFriendsStore.getState().sendFriendRequest('x@example.com'),
        expectedError: 'Failed to send friend request',
        expectedResult: false,
      },
      {
        run: () => useFriendsStore.getState().removeFriend('user-2'),
        expectedError: 'Failed to remove friend',
        expectedResult: false,
      },
      {
        run: () => useFriendsStore.getState().fetchFriendRequests(),
        expectedError: 'Failed to fetch friend requests',
      },
      {
        run: () => useFriendsStore.getState().acceptFriendRequest('request-1'),
        expectedError: 'Failed to accept friend request',
        expectedResult: false,
      },
      {
        run: () => useFriendsStore.getState().declineFriendRequest('request-1'),
        expectedError: 'Failed to decline friend request',
        expectedResult: false,
      },
      {
        run: () => useFriendsStore.getState().fetchSessionInvites(),
        expectedError: 'Failed to fetch session invites',
      },
      {
        run: () => useFriendsStore.getState().inviteFriendsToSession('AB123', ['user-2']),
        expectedError: 'Failed to invite friends',
        expectedResult: false,
      },
      {
        run: () => useFriendsStore.getState().acceptSessionInvite('invite-1'),
        expectedError: 'Failed to accept invite',
        expectedResult: { success: false },
      },
      {
        run: () => useFriendsStore.getState().declineSessionInvite('invite-1'),
        expectedError: 'Failed to decline invite',
        expectedResult: false,
      },
    ];

    for (const testCase of fallbackCases) {
      useFriendsStore.getState().clearError();
      global.fetch = vi.fn().mockRejectedValueOnce('network down');

      const result = await testCase.run();

      if ('expectedResult' in testCase) {
        expect(result).toEqual(testCase.expectedResult);
      }
      expect(useFriendsStore.getState().error).toBe(testCase.expectedError);
    }
  });
});

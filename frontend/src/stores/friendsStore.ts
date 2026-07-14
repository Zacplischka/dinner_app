// Zustand store for friends feature state
// Manages friends list, friend requests, and session invites

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Friend,
  FriendRequest,
  SessionInvite,
  UserProfile,
} from '@dinder/shared/types';
import * as apiClient from '../services/apiClient';

interface FriendsState {
  // Data
  friends: Friend[];
  friendRequests: FriendRequest[];
  sessionInvites: SessionInvite[];
  currentUserProfile: UserProfile | null;

  // Loading states
  isLoadingFriends: boolean;
  isLoadingRequests: boolean;
  isLoadingInvites: boolean;
  isSearching: boolean;

  // Search results
  searchResults: UserProfile[];

  // Error state
  error: string | null;

  // Actions - Profile
  fetchCurrentProfile: () => Promise<void>;

  // Actions - Friends
  fetchFriends: () => Promise<void>;
  searchUsers: (email: string) => Promise<UserProfile[]>;
  sendFriendRequest: (email: string) => Promise<boolean>;
  removeFriend: (friendId: string) => Promise<boolean>;

  // Actions - Friend Requests
  fetchFriendRequests: () => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  declineFriendRequest: (requestId: string) => Promise<boolean>;

  // Actions - Session Invites
  fetchSessionInvites: () => Promise<void>;
  inviteFriendsToSession: (sessionCode: string, friendIds: string[]) => Promise<boolean>;
  acceptSessionInvite: (inviteId: string) => Promise<{ success: boolean; sessionCode?: string }>;
  declineSessionInvite: (inviteId: string) => Promise<boolean>;

  // Utility
  clearError: () => void;
  reset: () => void;
}

type LoadingKey = 'isLoadingFriends' | 'isLoadingRequests' | 'isLoadingInvites' | 'isSearching';

export const useFriendsStore = create<FriendsState>()(
  devtools(
    (set, get) => {
      // Every action shares one loading/error lifecycle: clear the error,
      // run the call, and on failure log `Error <label>:`, store the error
      // message (or the fallback), and apply any extra error state.
      // Returns undefined on failure so callers pick their error value.
      async function run<T>(
        label: string,
        fallback: string,
        fn: () => Promise<T>,
        opts: { loading?: LoadingKey; onError?: Partial<FriendsState> } = {}
      ): Promise<T | undefined> {
        const start: Partial<FriendsState> = { error: null };
        if (opts.loading) start[opts.loading] = true;
        set(start);
        try {
          const result = await fn();
          if (opts.loading) set({ [opts.loading]: false });
          return result;
        } catch (error) {
          console.error(`Error ${label}:`, error);
          const failure: Partial<FriendsState> = {
            error: error instanceof Error ? error.message : fallback,
            ...opts.onError,
          };
          if (opts.loading) failure[opts.loading] = false;
          set(failure);
          return undefined;
        }
      }

      return {
        // Initial state
        friends: [],
        friendRequests: [],
        sessionInvites: [],
        currentUserProfile: null,
        isLoadingFriends: false,
        isLoadingRequests: false,
        isLoadingInvites: false,
        isSearching: false,
        searchResults: [],
        error: null,

        // Profile actions
        fetchCurrentProfile: async () => {
          await run('fetching profile', 'Failed to fetch profile', async () => {
            set({ currentUserProfile: await apiClient.getCurrentProfile() });
          });
        },

        // Friends actions
        fetchFriends: async () => {
          await run(
            'fetching friends',
            'Failed to fetch friends',
            async () => {
              set({ friends: await apiClient.getFriends() });
            },
            { loading: 'isLoadingFriends' }
          );
        },

        searchUsers: async (email: string) =>
          (await run(
            'searching users',
            'Failed to search users',
            async () => {
              const users = await apiClient.searchUsers(email);
              set({ searchResults: users });
              return users;
            },
            { loading: 'isSearching', onError: { searchResults: [] } }
          )) ?? [],

        sendFriendRequest: async (email: string) =>
          (await run('sending friend request', 'Failed to send friend request', async () => {
            await apiClient.sendFriendRequest(email);
            // Clear search results after sending request
            set({ searchResults: [] });
            return true;
          })) ?? false,

        removeFriend: async (friendId: string) =>
          (await run('removing friend', 'Failed to remove friend', async () => {
            await apiClient.removeFriend(friendId);
            set((state) => ({
              friends: state.friends.filter((f) => f.id !== friendId),
            }));
            return true;
          })) ?? false,

        // Friend request actions
        fetchFriendRequests: async () => {
          await run(
            'fetching friend requests',
            'Failed to fetch friend requests',
            async () => {
              set({ friendRequests: await apiClient.getFriendRequests() });
            },
            { loading: 'isLoadingRequests' }
          );
        },

        acceptFriendRequest: async (requestId: string) =>
          (await run('accepting friend request', 'Failed to accept friend request', async () => {
            await apiClient.acceptFriendRequest(requestId);
            set((state) => ({
              friendRequests: state.friendRequests.filter((r) => r.id !== requestId),
            }));
            // Refresh friends list to include the new friend
            void get().fetchFriends();
            return true;
          })) ?? false,

        declineFriendRequest: async (requestId: string) =>
          (await run('declining friend request', 'Failed to decline friend request', async () => {
            await apiClient.declineFriendRequest(requestId);
            set((state) => ({
              friendRequests: state.friendRequests.filter((r) => r.id !== requestId),
            }));
            return true;
          })) ?? false,

        // Session invite actions
        fetchSessionInvites: async () => {
          await run(
            'fetching session invites',
            'Failed to fetch session invites',
            async () => {
              set({ sessionInvites: await apiClient.getSessionInvites() });
            },
            { loading: 'isLoadingInvites' }
          );
        },

        inviteFriendsToSession: async (sessionCode: string, friendIds: string[]) =>
          (await run('inviting friends to session', 'Failed to invite friends', async () => {
            await apiClient.inviteFriendsToSession(sessionCode, friendIds);
            return true;
          })) ?? false,

        acceptSessionInvite: async (inviteId: string) =>
          (await run('accepting session invite', 'Failed to accept invite', async () => {
            const sessionCode = await apiClient.acceptSessionInvite(inviteId);
            set((state) => ({
              sessionInvites: state.sessionInvites.filter((i) => i.id !== inviteId),
            }));
            return { success: true, sessionCode };
          })) ?? { success: false },

        declineSessionInvite: async (inviteId: string) =>
          (await run('declining session invite', 'Failed to decline invite', async () => {
            await apiClient.declineSessionInvite(inviteId);
            set((state) => ({
              sessionInvites: state.sessionInvites.filter((i) => i.id !== inviteId),
            }));
            return true;
          })) ?? false,

        // Utility actions
        clearError: () => set({ error: null }),

        reset: () =>
          set({
            friends: [],
            friendRequests: [],
            sessionInvites: [],
            currentUserProfile: null,
            isLoadingFriends: false,
            isLoadingRequests: false,
            isLoadingInvites: false,
            isSearching: false,
            searchResults: [],
            error: null,
          }),
      };
    },
    { name: 'FriendsStore' }
  )
);

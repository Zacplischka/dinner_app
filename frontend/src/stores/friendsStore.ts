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

export const useFriendsStore = create<FriendsState>()(
  devtools(
    (set, get) => ({
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
        try {
          const profile = await apiClient.getCurrentProfile();
          set({ currentUserProfile: profile });
        } catch (error) {
          console.error('Error fetching profile:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to fetch profile' });
        }
      },

      // Friends actions
      fetchFriends: async () => {
        set({ isLoadingFriends: true, error: null });
        try {
          const friends = await apiClient.getFriends();
          set({ friends, isLoadingFriends: false });
        } catch (error) {
          console.error('Error fetching friends:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch friends',
            isLoadingFriends: false,
          });
        }
      },

      searchUsers: async (email: string) => {
        set({ isSearching: true, error: null });
        try {
          const users = await apiClient.searchUsers(email);
          set({ searchResults: users, isSearching: false });
          return users;
        } catch (error) {
          console.error('Error searching users:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to search users',
            isSearching: false,
            searchResults: [],
          });
          return [];
        }
      },

      sendFriendRequest: async (email: string) => {
        set({ error: null });
        try {
          await apiClient.sendFriendRequest(email);
          // Clear search results after sending request
          set({ searchResults: [] });
          return true;
        } catch (error) {
          console.error('Error sending friend request:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to send friend request' });
          return false;
        }
      },

      removeFriend: async (friendId: string) => {
        set({ error: null });
        try {
          await apiClient.removeFriend(friendId);

          // Remove friend from local state
          set((state) => ({
            friends: state.friends.filter((f) => f.id !== friendId),
          }));

          return true;
        } catch (error) {
          console.error('Error removing friend:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to remove friend' });
          return false;
        }
      },

      // Friend request actions
      fetchFriendRequests: async () => {
        set({ isLoadingRequests: true, error: null });
        try {
          const requests = await apiClient.getFriendRequests();
          set({ friendRequests: requests, isLoadingRequests: false });
        } catch (error) {
          console.error('Error fetching friend requests:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch friend requests',
            isLoadingRequests: false,
          });
        }
      },

      acceptFriendRequest: async (requestId: string) => {
        set({ error: null });
        try {
          await apiClient.acceptFriendRequest(requestId);

          // Remove from requests, refresh friends list
          set((state) => ({
            friendRequests: state.friendRequests.filter((r) => r.id !== requestId),
          }));

          // Refresh friends list to include the new friend
          get().fetchFriends();

          return true;
        } catch (error) {
          console.error('Error accepting friend request:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to accept friend request' });
          return false;
        }
      },

      declineFriendRequest: async (requestId: string) => {
        set({ error: null });
        try {
          await apiClient.declineFriendRequest(requestId);

          // Remove from requests
          set((state) => ({
            friendRequests: state.friendRequests.filter((r) => r.id !== requestId),
          }));

          return true;
        } catch (error) {
          console.error('Error declining friend request:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to decline friend request' });
          return false;
        }
      },

      // Session invite actions
      fetchSessionInvites: async () => {
        set({ isLoadingInvites: true, error: null });
        try {
          const invites = await apiClient.getSessionInvites();
          set({ sessionInvites: invites, isLoadingInvites: false });
        } catch (error) {
          console.error('Error fetching session invites:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch session invites',
            isLoadingInvites: false,
          });
        }
      },

      inviteFriendsToSession: async (sessionCode: string, friendIds: string[]) => {
        set({ error: null });
        try {
          await apiClient.inviteFriendsToSession(sessionCode, friendIds);
          return true;
        } catch (error) {
          console.error('Error inviting friends to session:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to invite friends' });
          return false;
        }
      },

      acceptSessionInvite: async (inviteId: string) => {
        set({ error: null });
        try {
          const sessionCode = await apiClient.acceptSessionInvite(inviteId);

          // Remove from invites
          set((state) => ({
            sessionInvites: state.sessionInvites.filter((i) => i.id !== inviteId),
          }));

          return { success: true, sessionCode };
        } catch (error) {
          console.error('Error accepting session invite:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to accept invite' });
          return { success: false };
        }
      },

      declineSessionInvite: async (inviteId: string) => {
        set({ error: null });
        try {
          await apiClient.declineSessionInvite(inviteId);

          // Remove from invites
          set((state) => ({
            sessionInvites: state.sessionInvites.filter((i) => i.id !== inviteId),
          }));

          return true;
        } catch (error) {
          console.error('Error declining session invite:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to decline invite' });
          return false;
        }
      },

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
    }),
    { name: 'FriendsStore' }
  )
);

// Selector hooks for convenience
export const useFriends = () => useFriendsStore((state) => state.friends);
export const useFriendRequests = () => useFriendsStore((state) => state.friendRequests);
export const useSessionInvites = () => useFriendsStore((state) => state.sessionInvites);
export const useFriendsLoading = () => useFriendsStore((state) => state.isLoadingFriends);
export const useFriendRequestsCount = () => useFriendsStore((state) => state.friendRequests.length);
export const useSessionInvitesCount = () => useFriendsStore((state) => state.sessionInvites.length);

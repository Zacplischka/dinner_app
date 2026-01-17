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
import { useAuthStore } from './authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const session = useAuthStore.getState().session;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

// Helper to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
  return response.json();
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
          const response = await fetch(`${API_URL}/api/users/me`, {
            headers: getAuthHeaders(),
          });

          const profile = await handleResponse<UserProfile>(response);
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
          const response = await fetch(`${API_URL}/api/friends`, {
            headers: getAuthHeaders(),
          });

          const data = await handleResponse<{ friends: Friend[] }>(response);
          set({ friends: data.friends, isLoadingFriends: false });
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
          const response = await fetch(
            `${API_URL}/api/users/search?email=${encodeURIComponent(email)}`,
            { headers: getAuthHeaders() }
          );

          const data = await handleResponse<{ users: UserProfile[] }>(response);
          set({ searchResults: data.users, isSearching: false });
          return data.users;
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
          const response = await fetch(`${API_URL}/api/friends/request`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ email }),
          });

          await handleResponse(response);
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
          const response = await fetch(`${API_URL}/api/friends/${friendId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });

          await handleResponse(response);

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
          const response = await fetch(`${API_URL}/api/friends/requests`, {
            headers: getAuthHeaders(),
          });

          const data = await handleResponse<{ requests: FriendRequest[] }>(response);
          set({ friendRequests: data.requests, isLoadingRequests: false });
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
          const response = await fetch(`${API_URL}/api/friends/${requestId}/accept`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });

          await handleResponse(response);

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
          const response = await fetch(`${API_URL}/api/friends/${requestId}/decline`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });

          await handleResponse(response);

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
          const response = await fetch(`${API_URL}/api/invites`, {
            headers: getAuthHeaders(),
          });

          const data = await handleResponse<{ invites: SessionInvite[] }>(response);
          set({ sessionInvites: data.invites, isLoadingInvites: false });
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
          const response = await fetch(`${API_URL}/api/sessions/${sessionCode}/invite`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ friendIds }),
          });

          await handleResponse(response);
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
          const response = await fetch(`${API_URL}/api/invites/${inviteId}/accept`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });

          const data = await handleResponse<{ success: boolean; sessionCode: string }>(response);

          // Remove from invites
          set((state) => ({
            sessionInvites: state.sessionInvites.filter((i) => i.id !== inviteId),
          }));

          return { success: true, sessionCode: data.sessionCode };
        } catch (error) {
          console.error('Error accepting session invite:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to accept invite' });
          return { success: false };
        }
      },

      declineSessionInvite: async (inviteId: string) => {
        set({ error: null });
        try {
          const response = await fetch(`${API_URL}/api/invites/${inviteId}/decline`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });

          await handleResponse(response);

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

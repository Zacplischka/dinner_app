// Zustand store for session state management
// Based on: specs/001-dinner-decider-enables/tasks.md T047

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Participant, Restaurant, Result } from '@dinder/shared/types';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

interface SessionState {
  // Session data
  sessionCode: string | null;
  participants: Participant[];
  currentUserId: string | null;

  // Location data
  location?: Location;
  searchRadiusMiles?: number;
  restaurants: Restaurant[];

  // Selection data
  selections: string[]; // Current user's Place IDs
  allSelections: Record<string, string[]>; // All participants' selections (after reveal)
  restaurantNames: Record<string, string>; // placeId -> name mapping for display
  overlappingOptions: Restaurant[];

  // Session status
  sessionStatus: 'waiting' | 'selecting' | 'complete' | 'expired';
  isConnected: boolean;

  // Actions
  setSessionCode: (code: string) => void;
  setCurrentUserId: (userId: string) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipants: (participants: Participant[]) => void;

  // Location actions
  setLocation: (location: Location) => void;
  setSearchRadiusMiles: (miles: number) => void;
  setRestaurants: (restaurants: Restaurant[]) => void;

  // Selection actions
  setSelections: (placeIds: string[]) => void;
  addSelection: (placeId: string) => void;
  removeSelection: (placeId: string) => void;

  // Results actions
  setResults: (results: Result) => void;

  // Status actions
  setSessionStatus: (status: 'waiting' | 'selecting' | 'complete' | 'expired') => void;
  setConnectionStatus: (isConnected: boolean) => void;

  // Reset action
  resetSession: () => void;
  resetSelections: () => void;
}

const initialState = {
  sessionCode: null,
  participants: [],
  currentUserId: null,
  location: undefined,
  searchRadiusMiles: undefined,
  restaurants: [],
  selections: [],
  allSelections: {},
  restaurantNames: {},
  overlappingOptions: [],
  sessionStatus: 'waiting' as const,
  isConnected: false,
};

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Session actions
        setSessionCode: (code) => set({ sessionCode: code }),

        setCurrentUserId: (userId) => set({ currentUserId: userId }),

        addParticipant: (participant) =>
          set((state) => ({
            participants: [...state.participants, participant],
          })),

        removeParticipant: (participantId) =>
          set((state) => ({
            participants: state.participants.filter((p) => p.participantId !== participantId),
          })),

        updateParticipants: (participants) => set({ participants }),

        // Location actions
        setLocation: (location) => set({ location }),

        setSearchRadiusMiles: (miles) => set({ searchRadiusMiles: miles }),

        setRestaurants: (restaurants) => set({ restaurants }),

        // Selection actions
        setSelections: (placeIds) => set({ selections: placeIds }),

        addSelection: (placeId) =>
          set((state) => {
            if (state.selections.includes(placeId)) {
              return state; // Already selected, no change
            }
            return { selections: [...state.selections, placeId] };
          }),

        removeSelection: (placeId) =>
          set((state) => ({
            selections: state.selections.filter((id) => id !== placeId),
          })),

        // Results actions
        setResults: (results) =>
          set({
            allSelections: results.allSelections,
            restaurantNames: results.restaurantNames || {},
            overlappingOptions: results.overlappingOptions,
            sessionStatus: 'complete',
          }),

        // Status actions
        setSessionStatus: (status) => set({ sessionStatus: status }),

        setConnectionStatus: (isConnected) => set({ isConnected }),

        // Reset actions
        resetSession: () => set(initialState),

        resetSelections: () =>
          set({
            selections: [],
            allSelections: {},
            restaurantNames: {},
            overlappingOptions: [],
            sessionStatus: 'selecting',
          }),
      }),
      {
        name: 'dinner-session-storage',
        version: 1,
        // isConnected is live socket state; rehydrating it as true would lie.
        partialize: ({ isConnected: _isConnected, ...rest }: SessionState): Partial<SessionState> =>
          rest,
        // Pre-v1 blobs have unversioned, possibly stale shapes — discard them.
        migrate: () => ({ ...initialState }),
        merge: (persisted, current) => ({
          ...current,
          ...((persisted ?? {}) as Partial<SessionState>),
          isConnected: false,
        }),
      }
    ),
    { name: 'DinnerSession' }
  )
);

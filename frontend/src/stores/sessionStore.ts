// Zustand store for session state management
// Based on: specs/001-dinner-decider-enables/tasks.md T047

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Participant, DinnerOption, Restaurant, Result } from '@dinner-app/shared/types';

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
  overlappingOptions: DinnerOption[] | Restaurant[];

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
  toggleSelection: (placeId: string) => void;

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

        toggleSelection: (optionId) =>
          set((state) => {
            const isSelected = state.selections.includes(optionId);
            return {
              selections: isSelected
                ? state.selections.filter((id) => id !== optionId)
                : [...state.selections, optionId],
            };
          }),

        // Results actions
        setResults: (results) =>
          set({
            allSelections: results.allSelections,
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
            overlappingOptions: [],
            sessionStatus: 'selecting',
          }),
      }),
      {
        name: 'dinner-session-storage',
        // Only persist essential data - use partialPersist if available in newer versions
        // For now, all state is persisted
      }
    ),
    { name: 'DinnerSession' }
  )
);

// Selector hooks for optimized re-renders
export const useSessionCode = () => useSessionStore((state) => state.sessionCode);
export const useParticipants = () => useSessionStore((state) => state.participants);
export const useCurrentUserId = () => useSessionStore((state) => state.currentUserId);
export const useSelections = () => useSessionStore((state) => state.selections);
export const useOverlappingOptions = () => useSessionStore((state) => state.overlappingOptions);
export const useSessionStatus = () => useSessionStore((state) => state.sessionStatus);
export const useConnectionStatus = () => useSessionStore((state) => state.isConnected);
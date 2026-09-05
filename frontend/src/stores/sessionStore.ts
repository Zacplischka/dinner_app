// Zustand store for session state management

import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import type { Branch, DeckEntry } from '@dinder/shared/types';
import type { Participant, Result } from '../types';
import { useOrderStore } from './orderStore';

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
  /** The Session's Branch, from the join ack. Undefined before the entry fork. */
  branch?: Branch;

  // Location data
  location?: Location;
  searchRadiusMiles?: number;
  restaurants: DeckEntry[];

  // Selection data
  selections: string[]; // Current user's Place IDs
  allSelections: Record<string, string[]>; // All participants' selections (after reveal)
  liveSelections: Record<string, string[]>; // placeId -> displayNames who live-selected it (remote only)
  restaurantNames: Record<string, string>; // placeId -> name mapping for display
  overlappingOptions: DeckEntry[];
  topPick?: { restaurant: DeckEntry; likedBy: number; of: number };
  /** The Shopping List the Cook ending minted, as the id of its own URL (#262). */
  shoppingListId?: string;

  // The crowned placeId a Group Order was opened for (set when "Order
  // together" is tapped). Persisted so a hard reload of /order can re-fire
  // order:open with no other source for the placeId (the route carries only
  // the session code). Cleared by resetSelections/resetSession.
  orderPlaceId: string | null;

  // Session status
  sessionStatus: 'waiting' | 'selecting' | 'complete' | 'expired';
  isConnected: boolean;
  /**
   * ISO timestamp of the Session's expiry, as last read from GET /api/sessions.
   * The backend slides the TTL forward on a join, a submission, a Restart and
   * the Group Order writes, and no socket event carries the new value — so the
   * pages that fetch the Session re-read it on every roster change.
   */
  expiresAt: string | null;

  // Actions
  setSessionCode: (code: string) => void;
  setBranch: (branch?: Branch) => void;
  setCurrentUserId: (userId: string) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipants: (participants: Participant[]) => void;

  // Location actions
  setLocation: (location: Location) => void;
  setSearchRadiusMiles: (miles: number) => void;
  setRestaurants: (restaurants: DeckEntry[]) => void;

  // Selection actions
  setSelections: (placeIds: string[]) => void;
  addSelection: (placeId: string) => void;
  removeSelection: (placeId: string) => void;
  recordLiveSelection: (placeId: string, displayName: string) => void;

  // Results actions
  setResults: (results: Result) => void;

  // Group Order actions
  setOrderPlaceId: (placeId: string | null) => void;

  // Status actions
  setSessionStatus: (status: 'waiting' | 'selecting' | 'complete' | 'expired') => void;
  setConnectionStatus: (isConnected: boolean) => void;
  setExpiresAt: (expiresAt: string) => void;

  // Reset action
  resetSession: () => void;
  resetSelections: () => void;
}

const initialState = {
  sessionCode: null,
  participants: [],
  currentUserId: null,
  branch: undefined,
  location: undefined,
  searchRadiusMiles: undefined,
  restaurants: [],
  selections: [],
  allSelections: {},
  liveSelections: {},
  restaurantNames: {},
  overlappingOptions: [],
  topPick: undefined,
  shoppingListId: undefined,
  orderPlaceId: null,
  sessionStatus: 'waiting' as const,
  isConnected: false,
  expiresAt: null,
};

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Session actions
        setSessionCode: (code) => set({ sessionCode: code }),

        setBranch: (branch) => set({ branch }),

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

        // Keyed by displayName, not participantId: participantId IS socket.id and
        // is re-minted on every reconnect, so a reloaded Participant replaying
        // their whole deck would otherwise be counted as several humans.
        // See ADR 0009.
        recordLiveSelection: (placeId, displayName) =>
          set((state) => {
            const names = state.liveSelections[placeId] ?? [];
            if (names.includes(displayName)) return state;
            return {
              liveSelections: { ...state.liveSelections, [placeId]: [...names, displayName] },
            };
          }),

        // Results actions
        setResults: (results) =>
          set({
            allSelections: results.allSelections,
            restaurantNames: results.restaurantNames || {},
            overlappingOptions: results.overlappingOptions,
            topPick: results.topPick,
            shoppingListId: results.shoppingListId,
            sessionStatus: 'complete',
          }),

        setOrderPlaceId: (placeId) => set({ orderPlaceId: placeId }),

        // Status actions
        setSessionStatus: (status) => set({ sessionStatus: status }),

        setConnectionStatus: (isConnected) => set({ isConnected }),

        setExpiresAt: (expiresAt) => set({ expiresAt }),

        // Reset actions
        resetSession: () => {
          useOrderStore.getState().clear();
          set(initialState);
        },

        resetSelections: () => {
          // A Restart voids the Match, and the server DELs both order keys in
          // the same resetForRestart pipeline — never render last venue's basket.
          useOrderStore.getState().clear();
          set({
            selections: [],
            allSelections: {},
            liveSelections: {},
            restaurantNames: {},
            overlappingOptions: [],
            topPick: undefined,
            shoppingListId: undefined,
            orderPlaceId: null,
            sessionStatus: 'selecting',
          });
        },
      }),
      {
        name: 'dinner-session-storage',
        version: 1,
        // #304: identity is per-tab. localStorage is origin-wide, so a second
        // tab of the same browser rehydrated the first tab's Participant and
        // its auto-rejoin evicted the host. sessionStorage is scoped to the
        // tab and survives reload (and iOS background-and-return), which is
        // exactly the case this persistence exists for.
        storage: createJSONStorage(() => sessionStorage),
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

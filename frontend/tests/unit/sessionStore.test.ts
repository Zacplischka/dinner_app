// Session Store Tests - TDD for location state management
// Phase 2.5: Update Session Store to handle location and restaurants

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOrderStore } from '../../src/stores/orderStore';

const STORAGE_KEY = 'dinner-session-storage';

// Rehydrates the store from localStorage by re-importing the module fresh.
async function freshStore() {
  vi.resetModules();
  const mod = await import('../../src/stores/sessionStore');
  return mod.useSessionStore;
}

describe('sessionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useSessionStore.getState().resetSession();
  });

  describe('location state', () => {
    it('should store and retrieve location with address', () => {
      const { setLocation } = useSessionStore.getState();

      setLocation({ latitude: 37.7749, longitude: -122.4194, address: 'San Francisco, CA' });

      const location = useSessionStore.getState().location;
      expect(location).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      });
    });

    it('should store and retrieve location without address', () => {
      const { setLocation } = useSessionStore.getState();

      setLocation({ latitude: 37.7749, longitude: -122.4194 });

      const location = useSessionStore.getState().location;
      expect(location).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      });
    });

    it('should clear location on reset', () => {
      const { setLocation, resetSession } = useSessionStore.getState();

      setLocation({ latitude: 37.7749, longitude: -122.4194, address: 'SF' });
      expect(useSessionStore.getState().location).toBeDefined();

      resetSession();
      expect(useSessionStore.getState().location).toBeUndefined();
    });
  });

  describe('search radius state', () => {
    it('should store and retrieve search radius', () => {
      const { setSearchRadiusMiles } = useSessionStore.getState();

      setSearchRadiusMiles(10);

      expect(useSessionStore.getState().searchRadiusMiles).toBe(10);
    });

    it('should default to undefined', () => {
      expect(useSessionStore.getState().searchRadiusMiles).toBeUndefined();
    });

    it('should allow updating radius', () => {
      const { setSearchRadiusMiles } = useSessionStore.getState();

      setSearchRadiusMiles(5);
      expect(useSessionStore.getState().searchRadiusMiles).toBe(5);

      setSearchRadiusMiles(15);
      expect(useSessionStore.getState().searchRadiusMiles).toBe(15);
    });

    it('should clear search radius on reset', () => {
      const { setSearchRadiusMiles, resetSession } = useSessionStore.getState();

      setSearchRadiusMiles(10);
      expect(useSessionStore.getState().searchRadiusMiles).toBe(10);

      resetSession();
      expect(useSessionStore.getState().searchRadiusMiles).toBeUndefined();
    });
  });

  describe('restaurant state', () => {
    it('should store restaurants', () => {
      const { setRestaurants } = useSessionStore.getState();

      const restaurants = [
        {
          placeId: 'place1',
          name: 'Pizza Palace',
          rating: 4.5,
          priceLevel: 2,
          cuisineType: 'Italian',
          address: '123 Main St',
        },
        {
          placeId: 'place2',
          name: 'Sushi Spot',
          rating: 4.8,
          priceLevel: 3,
        },
      ];

      setRestaurants(restaurants);

      expect(useSessionStore.getState().restaurants).toEqual(restaurants);
    });

    it('should default to empty array', () => {
      expect(useSessionStore.getState().restaurants).toEqual([]);
    });

    it('should clear restaurants on reset', () => {
      const { setRestaurants, resetSession } = useSessionStore.getState();

      setRestaurants([{ placeId: 'place1', name: 'Test', rating: 4.0, priceLevel: 2 }]);
      expect(useSessionStore.getState().restaurants).toHaveLength(1);

      resetSession();
      expect(useSessionStore.getState().restaurants).toEqual([]);
    });
  });

  describe('selections with Place IDs', () => {
    it('should store Place IDs as selections', () => {
      const { setSelections } = useSessionStore.getState();

      setSelections(['ChIJplace1', 'ChIJplace2']);

      expect(useSessionStore.getState().selections).toEqual(['ChIJplace1', 'ChIJplace2']);
    });
  });

  describe('persistence boundaries', () => {
    it('discards persisted state from an older schema version', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: {
            sessionCode: 'OLD12',
            overlappingOptions: [{ optionId: 'legacy', displayName: 'Legacy Shape' }],
            sessionStatus: 'complete',
          },
          version: 0,
        })
      );

      const store = await freshStore();

      expect(store.getState().sessionCode).toBeNull();
      expect(store.getState().overlappingOptions).toEqual([]);
      expect(store.getState().sessionStatus).toBe('waiting');
    });

    it('does not rehydrate isConnected as true', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { sessionCode: 'AB123', isConnected: true },
          version: 1,
        })
      );

      const store = await freshStore();

      expect(store.getState().sessionCode).toBe('AB123');
      expect(store.getState().isConnected).toBe(false);
    });

    it('never writes isConnected to storage', () => {
      useSessionStore.getState().setSessionCode('XYZ78');
      useSessionStore.getState().setConnectionStatus(true);

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

      expect(persisted.state.sessionCode).toBe('XYZ78');
      expect(persisted.state).not.toHaveProperty('isConnected');
    });
  });

  describe('session actions', () => {
    it('should add, remove, and replace participants', () => {
      const participant = {
        participantId: 'participant-1',
        displayName: 'Alice',
        sessionCode: 'AB123',
        joinedAt: 1,
        hasSubmitted: false,
        isHost: true,
      };

      useSessionStore.getState().addParticipant(participant);
      expect(useSessionStore.getState().participants).toEqual([participant]);

      useSessionStore.getState().removeParticipant('participant-1');
      expect(useSessionStore.getState().participants).toEqual([]);

      useSessionStore.getState().updateParticipants([participant]);
      expect(useSessionStore.getState().participants).toEqual([participant]);
    });

    it('should ignore duplicate addSelection calls and remove selections', () => {
      useSessionStore.getState().addSelection('place-1');
      useSessionStore.getState().addSelection('place-1');

      expect(useSessionStore.getState().selections).toEqual(['place-1']);

      useSessionStore.getState().removeSelection('place-1');
      expect(useSessionStore.getState().selections).toEqual([]);
    });

    it('should ignore duplicate recordLiveSelection calls per displayName and clear on resetSelections', () => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Alice');
      useSessionStore.getState().recordLiveSelection('place-1', 'Alice');
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');

      expect(useSessionStore.getState().liveSelections).toEqual({ 'place-1': ['Alice', 'Bob'] });

      useSessionStore.getState().resetSelections();

      expect(useSessionStore.getState().liveSelections).toEqual({});
    });

    it('should set results and reset only selection state', () => {
      useSessionStore.getState().setSelections(['place-1']);
      useSessionStore.getState().setResults({
        sessionCode: 'AB123',
        hasOverlap: true,
        overlappingOptions: [{ placeId: 'place-1', name: 'Pasta House' }],
        allSelections: { Alice: ['place-1'] },
      });

      expect(useSessionStore.getState().sessionStatus).toBe('complete');
      expect(useSessionStore.getState().restaurantNames).toEqual({});
      expect(useSessionStore.getState().overlappingOptions).toHaveLength(1);

      useSessionStore.getState().resetSelections();

      expect(useSessionStore.getState().selections).toEqual([]);
      expect(useSessionStore.getState().sessionStatus).toBe('selecting');
    });

    // Issue #180 — a Restart or a leave must never let a re-mounted
    // /order page render the previous venue's basket. The server DELs both
    // order keys in the same pipeline; this is the client-side half.
    const seedOrder = () =>
      useOrderStore.getState().setOrder({
        sessionCode: 'AB123',
        placeId: 'place-1',
        venueName: '11 Inch Pizza',
        platform: 'ubereats',
        pricesAt: '2026-07-22T07:42:00.000Z',
        lines: [],
        feeCents: 0,
        itemsCents: 500,
        totalCents: 500,
        shares: [],
        state: 'building',
      });

    it('clears the order store on resetSelections', () => {
      seedOrder();
      expect(useOrderStore.getState().order).not.toBeNull();

      useSessionStore.getState().resetSelections();

      expect(useOrderStore.getState().order).toBeNull();
      expect(useOrderStore.getState().menu).toEqual([]);
      expect(useOrderStore.getState().noMenuPlaceIds).toEqual([]);
    });

    it('clears the order store on resetSession', () => {
      seedOrder();
      expect(useOrderStore.getState().order).not.toBeNull();

      useSessionStore.getState().resetSession();

      expect(useOrderStore.getState().order).toBeNull();
      expect(useOrderStore.getState().menu).toEqual([]);
      expect(useOrderStore.getState().noMenuPlaceIds).toEqual([]);
    });
  });
});

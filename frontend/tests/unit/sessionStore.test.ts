// Session Store Tests - TDD for location state management
// Phase 2.5: Update Session Store to handle location and restaurants

import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../../src/stores/sessionStore';

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

      setRestaurants([
        { placeId: 'place1', name: 'Test', rating: 4.0, priceLevel: 2 },
      ]);
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

    it('should toggle Place ID selection', () => {
      const { toggleSelection } = useSessionStore.getState();

      toggleSelection('ChIJplace1');
      expect(useSessionStore.getState().selections).toContain('ChIJplace1');

      toggleSelection('ChIJplace1');
      expect(useSessionStore.getState().selections).not.toContain('ChIJplace1');
    });
  });
});

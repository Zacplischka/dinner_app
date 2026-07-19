import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComparisonStore } from '../../src/stores/comparisonStore';

describe('comparisonStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useComparisonStore.getState().reset();
  });

  it('persists location and radius but keeps Venue results and scroll position in memory', () => {
    const location = { latitude: -37.81, longitude: 144.96 };
    const venues = [{ placeId: 'place-1', name: '11 Inch Pizza', distanceMiles: 0.2 }];

    useComparisonStore.getState().setLocation(location);
    useComparisonStore.getState().setRadiusKm(8);
    useComparisonStore.getState().setSuburb('Melbourne');
    useComparisonStore.getState().setVenues(venues);
    useComparisonStore.getState().setScrollY(240);

    expect(useComparisonStore.getState()).toMatchObject({
      location,
      radiusKm: 8,
      suburb: 'Melbourne',
      venues,
      scrollY: 240,
    });
    const persisted = JSON.parse(localStorage.getItem('dinder-comparison')!);
    expect(persisted.state).toEqual({ location, radiusKm: 8, suburb: 'Melbourne' });
  });

  it('keeps the selected Cuisine beside cached Venues while the app is open', () => {
    const venues = [
      {
        placeId: 'place-1',
        name: '11 Inch Pizza',
        cuisineType: 'Pizza restaurant',
        distanceMiles: 0.2,
      },
    ];

    useComparisonStore.getState().setVenues(venues);
    useComparisonStore.getState().setSelectedCuisine('Pizza restaurant');

    expect(useComparisonStore.getState()).toMatchObject({
      venues,
      selectedCuisine: 'Pizza restaurant',
    });
  });

  it('keeps the Venue search query beside the active Cuisine while the app is open', () => {
    useComparisonStore.getState().setSelectedCuisine('Pizza Restaurant');
    useComparisonStore.getState().setSearchQuery('late night');

    expect(useComparisonStore.getState()).toMatchObject({
      selectedCuisine: 'Pizza Restaurant',
      searchQuery: 'late night',
    });
  });

  it('rehydrates a persisted location, radius, and suburb on a return visit', async () => {
    const location = { latitude: -37.81, longitude: 144.96 };
    localStorage.setItem(
      'dinder-comparison',
      JSON.stringify({
        state: { location, radiusKm: 9, suburb: 'Melbourne' },
        version: 0,
      })
    );
    vi.resetModules();

    const { useComparisonStore: rehydratedStore } = await import(
      '../../src/stores/comparisonStore'
    );

    await vi.waitFor(() => {
      expect(rehydratedStore.getState()).toMatchObject({
        location,
        radiusKm: 9,
        suburb: 'Melbourne',
        venues: [],
        scrollY: 0,
      });
    });
  });
});

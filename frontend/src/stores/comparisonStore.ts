import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Venue } from '@dinder/shared/types';

interface ComparisonLocation {
  latitude: number;
  longitude: number;
}

type VenueSort = 'nearest' | 'rating';

// ponytail: fixed page size for progressive reveal; virtualize only if a
// measured result set makes "Show more" batches feel slow.
export const VENUE_PAGE_SIZE = 24;

interface ComparisonState {
  location?: ComparisonLocation;
  suburb?: string;
  radiusKm: number;
  venues: Venue[];
  scrollY: number;
  visibleCount: number;
  sortBy: VenueSort;
  selectedCuisine?: string;
  searchQuery: string;
  // Single-field writes go through useComparisonStore.setState — zustand already
  // exposes it, so ten one-line setters would only restate the field list.
  reset: () => void;
}

const initialState = {
  location: undefined,
  suburb: undefined,
  radiusKm: 8,
  venues: [],
  scrollY: 0,
  visibleCount: VENUE_PAGE_SIZE,
  sortBy: 'nearest' as VenueSort,
  selectedCuisine: undefined,
  searchQuery: '',
};

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set) => ({
      ...initialState,
      reset: () => set(initialState),
    }),
    {
      name: 'dinder-comparison',
      partialize: ({ location, radiusKm, suburb }) => ({ location, radiusKm, suburb }),
    }
  )
);

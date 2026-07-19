import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Venue } from '@dinder/shared/types';

export interface ComparisonLocation {
  latitude: number;
  longitude: number;
}

export type VenueSort = 'nearest' | 'rating';

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
  setLocation: (location?: ComparisonLocation) => void;
  setSuburb: (suburb?: string) => void;
  setRadiusKm: (radiusKm: number) => void;
  setVenues: (venues: Venue[]) => void;
  setScrollY: (scrollY: number) => void;
  setVisibleCount: (visibleCount: number) => void;
  setSortBy: (sortBy: VenueSort) => void;
  setSelectedCuisine: (selectedCuisine?: string) => void;
  setSearchQuery: (searchQuery: string) => void;
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
      setLocation: (location) => set({ location }),
      setSuburb: (suburb) => set({ suburb }),
      setRadiusKm: (radiusKm) => set({ radiusKm }),
      setVenues: (venues) => set({ venues }),
      setScrollY: (scrollY) => set({ scrollY }),
      setVisibleCount: (visibleCount) => set({ visibleCount }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSelectedCuisine: (selectedCuisine) => set({ selectedCuisine }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      reset: () => set(initialState),
    }),
    {
      name: 'dinder-comparison',
      partialize: ({ location, radiusKm, suburb }) => ({ location, radiusKm, suburb }),
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Venue } from '@dinder/shared/types';

export interface ComparisonLocation {
  latitude: number;
  longitude: number;
}

interface ComparisonState {
  location?: ComparisonLocation;
  suburb?: string;
  radiusMiles: number;
  venues: Venue[];
  scrollY: number;
  selectedCuisine?: string;
  searchQuery: string;
  setLocation: (location?: ComparisonLocation) => void;
  setSuburb: (suburb?: string) => void;
  setRadiusMiles: (radiusMiles: number) => void;
  setVenues: (venues: Venue[]) => void;
  setScrollY: (scrollY: number) => void;
  setSelectedCuisine: (selectedCuisine?: string) => void;
  setSearchQuery: (searchQuery: string) => void;
  reset: () => void;
}

const initialState = {
  location: undefined,
  suburb: undefined,
  radiusMiles: 5,
  venues: [],
  scrollY: 0,
  selectedCuisine: undefined,
  searchQuery: '',
};

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set) => ({
      ...initialState,
      setLocation: (location) => set({ location }),
      setSuburb: (suburb) => set({ suburb }),
      setRadiusMiles: (radiusMiles) => set({ radiusMiles }),
      setVenues: (venues) => set({ venues }),
      setScrollY: (scrollY) => set({ scrollY }),
      setSelectedCuisine: (selectedCuisine) => set({ selectedCuisine }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      reset: () => set(initialState),
    }),
    {
      name: 'dinder-comparison',
      partialize: ({ location, radiusMiles, suburb }) => ({ location, radiusMiles, suburb }),
    }
  )
);

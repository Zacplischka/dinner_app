// Validates and geocodes a manual suburb/postcode query, shaping every
// failure into an Error whose message is safe to show the user.
// Lives outside apiClient so page tests can keep mocking apiClient wholesale.

import type { GeocodedArea } from '@dinder/shared/types';
import { geocodeArea } from './apiClient';

export async function resolveArea(rawQuery: string): Promise<GeocodedArea> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    throw new Error('Enter a suburb or postcode to search for.');
  }
  try {
    return await geocodeArea(query);
  } catch (cause: unknown) {
    // handleResponse throws Error with the backend message; a network
    // failure surfaces as TypeError from fetch itself.
    throw cause instanceof Error && !(cause instanceof TypeError)
      ? cause
      : new Error('We couldn’t look up that area. Check your connection and try again.');
  }
}

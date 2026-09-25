// Radius is presented in kilometres; the backend session/search contract
// is miles. Convert and clamp at the request edge in one place.
import { MAX_SEARCH_RADIUS_MILES, MIN_SEARCH_RADIUS_MILES } from '@dinder/shared/types';

export const KM_PER_MILE = 1.609344;
export const MIN_RADIUS_KM = 2;
export const MAX_RADIUS_KM = 24;

export function toBackendRadiusMiles(radiusKm: number): number {
  return Math.min(
    MAX_SEARCH_RADIUS_MILES,
    Math.max(MIN_SEARCH_RADIUS_MILES, Math.round((radiusKm / KM_PER_MILE) * 10) / 10)
  );
}

// Radius is presented in kilometres; the backend session/search contract
// is miles (1-15). Convert and clamp at the request edge in one place.

export const KM_PER_MILE = 1.609344;
export const MIN_RADIUS_KM = 2;
export const MAX_RADIUS_KM = 24;

export function toBackendRadiusMiles(radiusKm: number): number {
  return Math.min(15, Math.max(1, Math.round((radiusKm / KM_PER_MILE) * 10) / 10));
}

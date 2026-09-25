// Called only by the explicit location button. Coarse location is sufficient;
// denying permission still leaves the existing suburb/postcode flow available.
export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

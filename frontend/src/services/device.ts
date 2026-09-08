import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Geolocation } from '@capacitor/geolocation';

export function copyText(text: string): Promise<void> {
  return Capacitor.isNativePlatform()
    ? Clipboard.write({ string: text })
    : navigator.clipboard.writeText(text);
}

// Called only by the explicit location button. Coarse location is sufficient;
// denying permission still leaves the existing suburb/postcode flow available.
export async function currentPosition(): Promise<{
  coords: { latitude: number; longitude: number };
}> {
  if (Capacitor.isNativePlatform()) {
    return Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

export function publicUrl(path: string): string {
  const origin =
    import.meta.env.VITE_PUBLIC_ORIGIN ||
    (Capacitor.isNativePlatform() ? 'https://yupcrew.com' : window.location.origin);
  // Paths come from our router, never a scheme-relative URL supplied in a link.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('Invalid public path');
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) throw new Error('Invalid public path');
  return url.href;
}

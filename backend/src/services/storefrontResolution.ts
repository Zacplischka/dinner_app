// Shared pure helpers for Storefront Resolvers (see CONTEXT.md: Storefront Resolver).
import type { StorefrontCapture } from '@dinder/shared/types';
import { normalizeComparisonName } from './comparisonMatcher.js';

export function emptyCapture(status: 'not_found' | 'failed'): StorefrontCapture {
  return { status, deals: [], menu: [] };
}

export function deliveryAreaAddress(address: string): string {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(', ') : address;
}

export function nameMatches(left: string, right: string): boolean {
  const leftTokens = normalizeComparisonName(left).split(' ').filter(Boolean);
  const rightTokens = normalizeComparisonName(right).split(' ').filter(Boolean);
  const [shorter, longer] =
    leftTokens.length <= rightTokens.length ? [leftTokens, rightTokens] : [rightTokens, leftTokens];
  return shorter.length > 0 && shorter.every((token) => longer.includes(token));
}

export function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLng = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(haversine));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object');
  return value;
}

export function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

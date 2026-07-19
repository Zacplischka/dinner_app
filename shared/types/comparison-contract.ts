// Endpoint-specific REST and named SSE contracts for Venue search and
// Comparison entry (issue #109). Runtime parsers live beside their DTOs so
// untrusted Express/EventSource values cannot be cast into trusted shapes.

import { isApiError, type ApiError } from './api-errors.js';
import type {
  Comparison,
  MatchedItem,
  MenuItemCapture,
  SnapshotPayload,
  StorefrontCapture,
} from './comparison.js';
import type { Venue } from './models.js';

/** Where a results-screen tap came from; counted server-side for the #68 kill gates. */
export const COMPARISON_TAP_SOURCES = ['match_card', 'near_miss'] as const;
export type ComparisonTapSource = (typeof COMPARISON_TAP_SOURCES)[number];
/** Same vocabulary as a Set, for validating untrusted query params. */
export const COMPARISON_TAP_SOURCE_SET = new Set<string>(COMPARISON_TAP_SOURCES);

export function isComparisonTapSource(value: unknown): value is ComparisonTapSource {
  return typeof value === 'string' && COMPARISON_TAP_SOURCE_SET.has(value);
}

// GET /api/comparison/venues
export interface VenueSearchRequest {
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

export interface VenueSearchResponse {
  venues: Venue[];
  suburb?: string;
}

// GET /api/comparison/:placeId/stream
export interface ComparisonEntryRequest {
  placeId: string;
  source?: ComparisonTapSource;
}

export interface ComparisonStreamPayloads {
  venue: { placeId: string; venueName: string };
  storefront: {
    platform: 'ubereats' | 'doordash';
    storefront: StorefrontCapture;
  };
  comparison: { comparison: Comparison };
  error: ApiError;
}

export const COMPARISON_STREAM_EVENT_NAMES = [
  'venue',
  'storefront',
  'comparison',
  'error',
] as const;
export type ComparisonStreamEventName = (typeof COMPARISON_STREAM_EVENT_NAMES)[number];
export type ComparisonStreamEvent = {
  [Name in ComparisonStreamEventName]: { type: Name } & ComparisonStreamPayloads[Name];
}[ComparisonStreamEventName];

const COMPARISON_STREAM_EVENT_NAME_SET = new Set<string>(COMPARISON_STREAM_EVENT_NAMES);
const STOREFRONT_STATUS_SET = new Set<string>(['resolved', 'not_found', 'failed']);
const PLATFORM_SET = new Set<string>(['ubereats', 'doordash']);
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;

export function isComparisonStreamEventName(value: unknown): value is ComparisonStreamEventName {
  return typeof value === 'string' && COMPARISON_STREAM_EVENT_NAME_SET.has(value);
}

export function parseVenueSearchRequest(value: unknown): VenueSearchRequest | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = queryNumber(value.latitude);
  const longitude = queryNumber(value.longitude);
  const radiusMiles = queryNumber(value.radiusMiles);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(radiusMiles) ||
    radiusMiles < 1 ||
    radiusMiles > 15
  ) {
    return undefined;
  }
  return { latitude, longitude, radiusMiles };
}

export function isVenueSearchResponse(value: unknown): value is VenueSearchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.venues) &&
    value.venues.every(isVenue) &&
    (value.suburb === undefined || typeof value.suburb === 'string')
  );
}

export function parseComparisonEntryRequest(value: unknown): ComparisonEntryRequest | undefined {
  if (
    !isRecord(value) ||
    typeof value.placeId !== 'string' ||
    !PLACE_ID_PATTERN.test(value.placeId) ||
    (value.source !== undefined && !isComparisonTapSource(value.source))
  ) {
    return undefined;
  }
  return value.source === undefined
    ? { placeId: value.placeId }
    : { placeId: value.placeId, source: value.source };
}

export function parseComparisonStreamEvent(
  type: string,
  value: unknown
): ComparisonStreamEvent | undefined {
  if (!isRecord(value)) return undefined;
  if (
    type === 'venue' &&
    typeof value.placeId === 'string' &&
    typeof value.venueName === 'string'
  ) {
    return { type, placeId: value.placeId, venueName: value.venueName };
  }
  if (
    type === 'storefront' &&
    isPlatform(value.platform) &&
    isStorefrontCapture(value.storefront)
  ) {
    return { type, platform: value.platform, storefront: value.storefront };
  }
  if (type === 'comparison' && isComparison(value.comparison)) {
    return { type, comparison: value.comparison };
  }
  if (type === 'error' && isApiError(value)) {
    return { type, code: value.code, message: value.message };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function queryNumber(value: unknown): number {
  return typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
}

function isVenue(value: unknown): value is Venue {
  return (
    isRecord(value) &&
    typeof value.placeId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.distanceMiles === 'number' &&
    Number.isFinite(value.distanceMiles) &&
    optionalNumber(value.rating) &&
    optionalString(value.cuisineType) &&
    optionalString(value.address) &&
    optionalString(value.photoUrl)
  );
}

function isStorefrontCapture(value: unknown): value is StorefrontCapture {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    STOREFRONT_STATUS_SET.has(value.status) &&
    optionalString(value.storeUrl) &&
    optionalString(value.imageUrl) &&
    isStringArray(value.deals) &&
    Array.isArray(value.menu) &&
    value.menu.every(isMenuItemCapture)
  );
}

function isMenuItemCapture(value: unknown): value is MenuItemCapture {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.price_cents === 'number' &&
    Number.isInteger(value.price_cents) &&
    optionalString(value.section) &&
    isStringArray(value.tags)
  );
}

function isComparison(value: unknown): value is Comparison {
  if (
    !isRecord(value) ||
    typeof value.placeId !== 'string' ||
    typeof value.venueName !== 'string' ||
    typeof value.fetchedAt !== 'string' ||
    !isSnapshotPayload(value.storefronts) ||
    !Array.isArray(value.matchedItems) ||
    !value.matchedItems.every(isMatchedItem) ||
    !isRecord(value.unmatched) ||
    !Array.isArray(value.unmatched.ubereats) ||
    !value.unmatched.ubereats.every(isMenuItemCapture) ||
    !Array.isArray(value.unmatched.doordash) ||
    !value.unmatched.doordash.every(isMenuItemCapture)
  ) {
    return false;
  }
  return value.cheaperMenu === undefined || isCheaperMenu(value.cheaperMenu);
}

export function isSnapshotPayload(value: unknown): value is SnapshotPayload {
  return (
    isRecord(value) && isStorefrontCapture(value.ubereats) && isStorefrontCapture(value.doordash)
  );
}

function isMatchedItem(value: unknown): value is MatchedItem {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isMenuItemCapture(value.ubereats) &&
    isMenuItemCapture(value.doordash)
  );
}

function isCheaperMenu(value: unknown): value is NonNullable<Comparison['cheaperMenu']> {
  return (
    isRecord(value) &&
    isPlatform(value.platform) &&
    typeof value.percent === 'number' &&
    Number.isFinite(value.percent)
  );
}

function isPlatform(value: unknown): value is 'ubereats' | 'doordash' {
  return typeof value === 'string' && PLATFORM_SET.has(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

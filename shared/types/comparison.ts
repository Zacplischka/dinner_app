export type StorefrontStatus = 'resolved' | 'not_found' | 'failed';

export interface MenuItemCapture {
  name: string;
  price_cents: number;
  section?: string;
  tags: string[];
}

export interface StorefrontCapture {
  status: StorefrontStatus;
  storeUrl?: string;
  /** The Storefront's own hero/cover photo — the $0 alternative to a Places photo call. */
  imageUrl?: string;
  deals: string[];
  menu: MenuItemCapture[];
}

export interface SnapshotPayload {
  ubereats: StorefrontCapture;
  doordash: StorefrontCapture;
}

export interface Snapshot {
  id: string;
  placeId: string;
  venueName: string;
  fetchedAt: string;
  payload: SnapshotPayload;
}

/**
 * Freshness Window: how long the newest Snapshot serves as the current
 * Comparison instead of paying for new actor runs. A successful Snapshot is
 * trusted for 6 hours — prices rarely move intraday, and the longer window is
 * what keeps the feature viable under Apify's free-plan spend cap (ADR 0005).
 * A Snapshot containing a failed Storefront is retried after 2 minutes.
 */
export const SNAPSHOT_FRESHNESS_MS = 6 * 60 * 60_000;
export const SNAPSHOT_FAILURE_FRESHNESS_MS = 2 * 60_000;

export interface Comparison {
  placeId: string;
  venueName: string;
  fetchedAt: string;
  storefronts: SnapshotPayload;
  matchedItems: MatchedItem[];
  unmatched: {
    ubereats: MenuItemCapture[];
    doordash: MenuItemCapture[];
  };
  cheaperMenu?: {
    platform: 'ubereats' | 'doordash';
    percent: number;
  };
}

export interface MatchedItem {
  name: string;
  ubereats: MenuItemCapture;
  doordash: MenuItemCapture;
}

/** Where a results-screen tap came from; counted server-side for the #68 kill gates. */
export const COMPARISON_TAP_SOURCES = ['match_card', 'near_miss'] as const;
export type ComparisonTapSource = (typeof COMPARISON_TAP_SOURCES)[number];
/** Same vocabulary as a Set, for validating untrusted query params. */
export const COMPARISON_TAP_SOURCE_SET = new Set<string>(COMPARISON_TAP_SOURCES);

export type ComparisonStreamEvent =
  | { type: 'venue'; placeId: string; venueName: string }
  | { type: 'storefront'; platform: 'ubereats' | 'doordash'; storefront: StorefrontCapture }
  | { type: 'comparison'; comparison: Comparison }
  | { type: 'error'; code: string; message: string };

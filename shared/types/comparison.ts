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

export type ComparisonStreamEvent =
  | { type: 'venue'; placeId: string; venueName: string }
  | { type: 'storefront'; platform: 'ubereats' | 'doordash'; storefront: StorefrontCapture }
  | { type: 'comparison'; comparison: Comparison }
  | { type: 'error'; code: string; message: string };

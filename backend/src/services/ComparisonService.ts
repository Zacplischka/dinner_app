import type {
  Comparison,
  ComparisonStreamEvent,
  MenuItemCapture,
  Snapshot,
  SnapshotPayload,
  StorefrontCapture,
} from '@dinder/shared/types';
import type { VenueDetails } from './RestaurantSearchService.js';
import { deriveComparison, normalizeComparisonName } from './comparisonMatcher.js';

const UBER_EATS_ACTOR_ID = 'borderline/uber-eats-scraper-ppr';
const DOORDASH_ACTOR_ID = 'abotapi/doordash-scraper';

interface SnapshotStore {
  getLatest(placeId: string): Promise<Snapshot | null>;
  insert(input: {
    placeId: string;
    venueName: string;
    payload: SnapshotPayload;
  }): Promise<Snapshot>;
}

interface ComparisonServiceDeps {
  runActor(actorId: string, input: Record<string, unknown>): Promise<unknown[]>;
  uberEatsActorId?: string;
  doorDashActorId?: string;
  fetchPlaceDetails(placeId: string): Promise<VenueDetails>;
  snapshotStore: SnapshotStore;
  freshnessMs: number;
  failureFreshnessMs?: number;
  settleCapMs: number;
}

interface Flight {
  subscribers: Set<(event: ComparisonStreamEvent) => void>;
  events: ComparisonStreamEvent[];
}

interface ComparisonSubscriptionOptions {
  beginColdCompare?: () => boolean;
}

export interface ComparisonService {
  subscribe(
    placeId: string,
    subscriber: (event: ComparisonStreamEvent) => void,
    options?: ComparisonSubscriptionOptions
  ): () => void;
}

export function createComparisonService(deps: ComparisonServiceDeps): ComparisonService {
  // ponytail: in-memory dedupe assumes the single Railway backend instance.
  const flights = new Map<string, Flight>();

  const emit = (flight: Flight, event: ComparisonStreamEvent) => {
    flight.events.push(event);
    for (const subscriber of flight.subscribers) subscriber(event);
  };

  const runFlight = async (
    placeId: string,
    flight: Flight,
    options?: ComparisonSubscriptionOptions
  ) => {
    try {
      const latest = await deps.snapshotStore.getLatest(placeId);
      if (latest && isFresh(latest, deps.freshnessMs, deps.failureFreshnessMs)) {
        emitSnapshot(flight, latest, emit);
        return;
      }
      if (options?.beginColdCompare && !options.beginColdCompare()) {
        emit(flight, {
          type: 'error',
          code: 'RATE_LIMITED',
          message: 'Too many comparisons. Please try again shortly.',
        });
        return;
      }

      const venue = await deps.fetchPlaceDetails(placeId);
      emit(flight, { type: 'venue', placeId: venue.placeId, venueName: venue.name });

      const uberEatsPromise = fetchUberEats(deps, latest, venue).then((storefront) => {
        emit(flight, { type: 'storefront', platform: 'ubereats', storefront });
        return storefront;
      });
      const doorDashPromise = fetchDoorDash(deps, latest, venue).then((storefront) => {
        emit(flight, { type: 'storefront', platform: 'doordash', storefront });
        return storefront;
      });
      const [uberEats, doorDash] = await Promise.all([uberEatsPromise, doorDashPromise]);
      const payload: SnapshotPayload = { ubereats: uberEats, doordash: doorDash };
      const snapshot = await deps.snapshotStore.insert({
        placeId: venue.placeId,
        venueName: venue.name,
        payload,
      });
      emit(flight, { type: 'comparison', comparison: toComparison(snapshot) });
    } catch {
      emit(flight, {
        type: 'error',
        code: 'COMPARISON_FAILED',
        message: 'Could not compare this Venue right now.',
      });
    } finally {
      flights.delete(placeId);
    }
  };

  return {
    subscribe(placeId, subscriber, options) {
      let flight = flights.get(placeId);
      if (flight) {
        flight.subscribers.add(subscriber);
        for (const event of flight.events) subscriber(event);
      } else {
        flight = { subscribers: new Set([subscriber]), events: [] };
        flights.set(placeId, flight);
        void runFlight(placeId, flight, options);
      }

      return () => {
        flight?.subscribers.delete(subscriber);
      };
    },
  };
}

function emitSnapshot(
  flight: Flight,
  snapshot: Snapshot,
  emit: (flight: Flight, event: ComparisonStreamEvent) => void
) {
  emit(flight, { type: 'venue', placeId: snapshot.placeId, venueName: snapshot.venueName });
  emit(flight, {
    type: 'storefront',
    platform: 'ubereats',
    storefront: snapshot.payload.ubereats,
  });
  emit(flight, {
    type: 'storefront',
    platform: 'doordash',
    storefront: snapshot.payload.doordash,
  });
  emit(flight, { type: 'comparison', comparison: toComparison(snapshot) });
}

function toComparison(snapshot: Snapshot): Comparison {
  return deriveComparison(snapshot);
}

function isFresh(
  snapshot: Snapshot,
  freshnessMs: number,
  failureFreshnessMs = 2 * 60_000
): boolean {
  const ageMs = Date.now() - Date.parse(snapshot.fetchedAt);
  const hasFailure = [snapshot.payload.ubereats, snapshot.payload.doordash].some(
    (storefront) => storefront?.status === 'failed'
  );
  const maxAgeMs = hasFailure ? Math.min(freshnessMs, failureFreshnessMs) : freshnessMs;
  return ageMs >= 0 && ageMs < maxAgeMs;
}

function emptyCapture(status: 'not_found' | 'failed'): StorefrontCapture {
  return { status, deals: [], menu: [] };
}

function settleWithin<T>(promise: Promise<T>, settleCapMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Actor run exceeded settle cap')), settleCapMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Actor run failed'));
      }
    );
  });
}

async function fetchUberEats(
  deps: ComparisonServiceDeps,
  latest: Snapshot | null,
  venue: VenueDetails
): Promise<StorefrontCapture> {
  const actorId = deps.uberEatsActorId || UBER_EATS_ACTOR_ID;
  const storedUrl = latest?.payload.ubereats?.storeUrl;
  if (storedUrl) {
    try {
      const output = await settleWithin(
        deps.runActor(actorId, {
          urls: [storedUrl],
          locale: 'en-AU',
          getMenuCustomizations: false,
        }),
        deps.settleCapMs
      );
      const capture = resolveUberEats(output, venue);
      if (capture.status === 'resolved') return capture;
    } catch {
      // A stale stored URL falls through to the normal name-resolution recipe.
    }
  }

  try {
    const output = await settleWithin(
      deps.runActor(actorId, {
        address: deliveryAreaAddress(venue.address),
        addressCountry: 'AU',
        query: venue.name,
        storeType: 'RESTAURANTS',
        maxRows: 5,
        locale: 'en-AU',
        getMenuCustomizations: false,
      }),
      deps.settleCapMs
    );
    return resolveUberEats(output, venue);
  } catch {
    return emptyCapture('failed');
  }
}

async function fetchDoorDash(
  deps: ComparisonServiceDeps,
  latest: Snapshot | null,
  venue: VenueDetails
): Promise<StorefrontCapture> {
  const actorId = deps.doorDashActorId || DOORDASH_ACTOR_ID;
  const storedUrl = latest?.payload.doordash?.storeUrl;
  if (storedUrl) {
    try {
      const output = await settleWithin(
        deps.runActor(actorId, doorDashInput({ mode: 'url', urls: [storedUrl] })),
        deps.settleCapMs
      );
      const capture = resolveDoorDash(output, venue);
      if (capture.status === 'resolved') return capture;
    } catch {
      // A stale stored URL falls through to name resolution.
    }
  }

  try {
    const output = await settleWithin(
      deps.runActor(actorId, doorDashInput({
        mode: 'search',
        search: [venue.name],
        location: deliveryAreaAddress(venue.address),
        storeType: 'restaurant',
        maxPages: 1,
      })),
      deps.settleCapMs
    );
    return resolveDoorDash(output, venue);
  } catch {
    return emptyCapture('failed');
  }
}

function doorDashInput(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    maxStores: 1,
    includeMenu: true,
    includeBusiness: false,
    includeReviews: false,
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: 'AU',
    },
  };
}

function resolveUberEats(output: unknown[], venue: VenueDetails): StorefrontCapture {
  for (const value of output) {
    const candidate = record(value);
    if (string(candidate.error)) continue;
    const title = string(candidate.title);
    const url = string(candidate.url);
    const storeUrl = url ? normalizeUberEatsUrl(url) : undefined;
    const currencyCode = string(candidate.currencyCode);
    const location = record(candidate.location);
    const latitude = number(location.latitude);
    const longitude = number(location.longitude);
    if (!title || !storeUrl || !currencyCode || latitude === undefined || longitude === undefined) {
      throw new Error('Uber Eats returned malformed Storefront details');
    }
    if (!nameMatches(venue.name, title) || distanceMeters(venue, { latitude, longitude }) > 100) {
      continue;
    }
    if (currencyCode !== 'AUD' || !Array.isArray(candidate.menu)) {
      throw new Error('Uber Eats returned an invalid Australian menu');
    }

    const deals: string[] = [];
    const menuById = new Map<string, MenuItemCapture>();
    for (const sectionValue of candidate.menu) {
      const section = record(sectionValue);
      const sectionName = string(section.catalogName);
      if (!Array.isArray(section.catalogItems)) continue;
      for (const itemValue of section.catalogItems) {
        const item = record(itemValue);
        const id = string(item.uuid);
        const name = string(item.title);
        const price = number(item.price);
        if (!id || !name || price === undefined || !Number.isSafeInteger(price) || price < 0) continue;

        const actorTags = Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
          : [];
        const promo = string(item.promo);
        const tags = unique([...actorTags, ...(promo ? [promo] : [])]);
        if (promo && !deals.includes(promo)) deals.push(promo);

        const existing = menuById.get(id);
        if (!existing) {
          menuById.set(id, {
            name,
            price_cents: price,
            ...(sectionName ? { section: sectionName } : {}),
            tags,
          });
          continue;
        }

        existing.tags = unique([...existing.tags, ...tags]);
        if (promotionalSection(existing.section) && !promotionalSection(sectionName)) {
          existing.section = sectionName;
        }
      }
    }

    return {
      status: 'resolved',
      storeUrl,
      deals,
      menu: [...menuById.values()],
    };
  }

  return emptyCapture('not_found');
}

function deliveryAreaAddress(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(', ') : address;
}

function normalizeUberEatsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname !== 'www.ubereats.com' && url.hostname !== 'ubereats.com') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function resolveDoorDash(output: unknown[], venue: VenueDetails): StorefrontCapture {
  for (const value of output) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    const name = string(candidate.name);
    const url = string(candidate.url);
    const currency = string(candidate.currency);
    const latitude = number(candidate.latitude);
    const longitude = number(candidate.longitude);
    if (!name || !url || !currency || latitude === undefined || longitude === undefined) {
      continue;
    }

    const storeUrl = normalizeDoorDashUrl(url);
    if (!storeUrl || currency !== 'AUD') continue;
    if (!nameMatches(venue.name, name)) continue;
    if (distanceMeters(venue, { latitude, longitude }) > 100) continue;
    const actorMenu = record(candidate.menu);
    if (!Array.isArray(actorMenu.items)) throw new Error('DoorDash returned an invalid menu');
    const menu: MenuItemCapture[] = [];
    for (const itemValue of actorMenu.items) {
      if (!itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) continue;
      const item = itemValue as Record<string, unknown>;
      const itemName = string(item.name);
      const price = doorDashPriceCents(item.price);
      if (!itemName || price === undefined) continue;
      const section = string(item.category);
      menu.push({
        name: itemName,
        price_cents: price,
        ...(section ? { section } : {}),
        tags: [],
      });
    }

    return { status: 'resolved', storeUrl, deals: [], menu };
  }

  return emptyCapture('not_found');
}

function doorDashPriceCents(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:\d+\s+for\s+)?A\$(\d+)\.(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function normalizeDoorDashUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname !== 'www.doordash.com' && url.hostname !== 'doordash.com') return undefined;
    if (!url.pathname.startsWith('/store/')) return undefined;
    return `https://www.doordash.com${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function promotionalSection(section?: string): boolean {
  return section === 'Featured items' || section === 'Offers';
}

function nameMatches(left: string, right: string): boolean {
  const leftTokens = normalizeComparisonName(left).split(' ').filter(Boolean);
  const rightTokens = normalizeComparisonName(right).split(' ').filter(Boolean);
  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  return shorter.length > 0 && shorter.every((token) => longer.includes(token));
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLng = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(haversine));
}

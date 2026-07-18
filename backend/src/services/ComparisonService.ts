import type {
  Comparison,
  ComparisonStreamEvent,
  Snapshot,
  SnapshotPayload,
  StorefrontCapture,
} from '@dinder/shared/types';
import type { VenueDetails } from './RestaurantSearchService.js';
import { deriveComparison } from './comparisonMatcher.js';
import { doorDashStorefront } from './doorDashStorefront.js';
import { emptyCapture } from './storefrontResolution.js';
import { uberEatsStorefront } from './uberEatsStorefront.js';

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

export interface StorefrontResolver {
  defaultActorId: string;
  urlInput(storedUrl: string): Record<string, unknown>;
  searchInput(venue: VenueDetails): Record<string, unknown>;
  // Throws when the payload is malformed (the actor changed shape) — the fetch
  // flow records that as `failed`; a clean miss returns `not_found`.
  resolve(output: unknown[], venue: VenueDetails): StorefrontCapture;
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

      const uberEatsPromise = fetchStorefront(
        deps,
        uberEatsStorefront,
        deps.uberEatsActorId || uberEatsStorefront.defaultActorId,
        latest?.payload.ubereats?.storeUrl,
        venue
      ).then((storefront) => {
        emit(flight, { type: 'storefront', platform: 'ubereats', storefront });
        return storefront;
      });
      const doorDashPromise = fetchStorefront(
        deps,
        doorDashStorefront,
        deps.doorDashActorId || doorDashStorefront.defaultActorId,
        latest?.payload.doordash?.storeUrl,
        venue
      ).then((storefront) => {
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

async function fetchStorefront(
  deps: ComparisonServiceDeps,
  resolver: StorefrontResolver,
  actorId: string,
  storedUrl: string | undefined,
  venue: VenueDetails
): Promise<StorefrontCapture> {
  if (storedUrl) {
    try {
      const output = await settleWithin(
        deps.runActor(actorId, resolver.urlInput(storedUrl)),
        deps.settleCapMs
      );
      const capture = resolver.resolve(output, venue);
      if (capture.status === 'resolved') return capture;
    } catch {
      // A stale stored URL falls through to name resolution.
    }
  }

  try {
    const output = await settleWithin(
      deps.runActor(actorId, resolver.searchInput(venue)),
      deps.settleCapMs
    );
    return resolver.resolve(output, venue);
  } catch {
    return emptyCapture('failed');
  }
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

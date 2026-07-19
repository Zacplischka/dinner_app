import { describe, expect, it, vi } from 'vitest';
import type { ComparisonStreamEvent, Snapshot, SnapshotPayload } from '@dinder/shared/types';
import { SNAPSHOT_FAILURE_FRESHNESS_MS, SNAPSHOT_FRESHNESS_MS } from '@dinder/shared/types';
import doorDashFixture from '../fixtures/comparison/doordash-search-11-inch-pizza.json';
import { createComparisonService } from '../../src/services/ComparisonService.js';
import { doorDashStorefront } from '../../src/services/doorDashStorefront.js';

const DOORDASH_URL = 'https://www.doordash.com/store/30221303/';
const venue = {
  placeId: 'place-1',
  name: '11 Inch Pizza',
  address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
  latitude: -37.8156,
  longitude: 144.9631,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function collectComparison(
  service: ReturnType<typeof createComparisonService>,
  placeId = 'place-1'
): { events: ComparisonStreamEvent[]; terminal: Promise<ComparisonStreamEvent[]> } {
  const events: ComparisonStreamEvent[] = [];
  const terminal = new Promise<ComparisonStreamEvent[]>((resolve) => {
    service.subscribe(placeId, (event) => {
      events.push(event);
      if (event.type === 'comparison' || event.type === 'error') resolve(events);
    });
  });
  return { events, terminal };
}

function insertedSnapshot(payload: SnapshotPayload): Snapshot {
  return {
    id: 'snapshot-new',
    placeId: 'place-1',
    venueName: venue.name,
    fetchedAt: '2026-07-13T08:00:00.000Z',
    payload,
  };
}

function staleSnapshot(storefront: SnapshotPayload['doordash']): Snapshot {
  return {
    id: 'stale',
    placeId: 'place-1',
    venueName: venue.name,
    fetchedAt: new Date(Date.now() - SNAPSHOT_FRESHNESS_MS - 60_000).toISOString(),
    payload: {
      ubereats: { status: 'not_found', deals: [], menu: [] },
      doordash: storefront,
    },
  };
}

describe('createComparisonService DoorDash actor', () => {
  it('searches once and streams what the Resolver captures', async () => {
    const runActor = vi.fn((actorId: string) =>
      Promise.resolve(actorId === doorDashStorefront.defaultActorId ? doorDashFixture : [])
    );
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(
      runActor.mock.calls.filter(([actorId]) => actorId === doorDashStorefront.defaultActorId)
    ).toHaveLength(1);
    expect(runActor).toHaveBeenCalledWith(
      doorDashStorefront.defaultActorId,
      doorDashStorefront.searchInput(venue)
    );
    const doorDashEvent = events.find(
      (event) => event.type === 'storefront' && event.platform === 'doordash'
    );
    if (doorDashEvent?.type !== 'storefront') throw new Error('missing DoorDash event');
    expect(doorDashEvent.storefront).toEqual(doorDashStorefront.resolve(doorDashFixture, venue));
    expect(insert).toHaveBeenCalledWith({
      placeId: venue.placeId,
      venueName: venue.name,
      payload: {
        ubereats: { status: 'not_found', deals: [], menu: [] },
        doordash: doorDashEvent.storefront,
      },
    });
  });

  it('refreshes a stale Storefront in URL mode without searching', async () => {
    const runActor = vi.fn((actorId: string) =>
      Promise.resolve(actorId === doorDashStorefront.defaultActorId ? doorDashFixture : [])
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(
          staleSnapshot({
            status: 'resolved',
            storeUrl: DOORDASH_URL,
            deals: [],
            menu: [],
          })
        ),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
          insertedSnapshot(payload)
        ),
      },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(
      runActor.mock.calls.filter(([actorId]) => actorId === doorDashStorefront.defaultActorId)
    ).toEqual([[doorDashStorefront.defaultActorId, doorDashStorefront.urlInput(DOORDASH_URL)]]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'storefront',
        platform: 'doordash',
        storefront: expect.objectContaining({ status: 'resolved', storeUrl: DOORDASH_URL }),
      })
    );
  });

  it.each([
    ['fails', () => Promise.reject(new Error('store removed'))],
    ['does not resolve', () => Promise.resolve([])],
  ] as const)('falls back to search when stale URL mode %s', async (_case, firstRun) => {
    let doorDashRuns = 0;
    const runActor = vi.fn((actorId: string) => {
      if (actorId !== doorDashStorefront.defaultActorId) return Promise.resolve([]);
      doorDashRuns += 1;
      return doorDashRuns === 1 ? firstRun() : Promise.resolve(doorDashFixture);
    });
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(
          staleSnapshot({
            status: 'resolved',
            storeUrl: DOORDASH_URL,
            deals: [],
            menu: [],
          })
        ),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
          insertedSnapshot(payload)
        ),
      },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(
      runActor.mock.calls.filter(([actorId]) => actorId === doorDashStorefront.defaultActorId)
    ).toEqual([
      [doorDashStorefront.defaultActorId, doorDashStorefront.urlInput(DOORDASH_URL)],
      [doorDashStorefront.defaultActorId, doorDashStorefront.searchInput(venue)],
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'storefront',
        platform: 'doordash',
        storefront: expect.objectContaining({ status: 'resolved' }),
      })
    );
  });

  it.each([
    ['not_found', () => Promise.resolve([])],
    ['failed', () => Promise.reject(new Error('quota exhausted'))],
  ] as const)('distinguishes a %s DoorDash result', async (status, actorRun) => {
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const service = createComparisonService({
      runActor: vi.fn((actorId: string) =>
        actorId === doorDashStorefront.defaultActorId ? actorRun() : Promise.resolve([])
      ),
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(events).toContainEqual({
      type: 'storefront',
      platform: 'doordash',
      storefront: { status, deals: [], menu: [] },
    });
    expect(insert).toHaveBeenCalledOnce();
  });

  it('replays settled events on reconnect without another actor run', async () => {
    const doorDashRun = deferred<unknown[]>();
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const runActor = vi.fn((actorId: string) =>
      actorId === doorDashStorefront.defaultActorId ? doorDashRun.promise : Promise.resolve([])
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      settleCapMs: 100,
    });
    const firstEvents: ComparisonStreamEvent[] = [];
    const unsubscribe = service.subscribe('place-1', (event) => firstEvents.push(event));
    await vi.waitFor(() =>
      expect(firstEvents).toContainEqual({
        type: 'storefront',
        platform: 'ubereats',
        storefront: { status: 'not_found', deals: [], menu: [] },
      })
    );
    unsubscribe();

    const second = collectComparison(service);

    expect(second.events).toEqual(firstEvents);
    expect(runActor).toHaveBeenCalledTimes(2);
    doorDashRun.resolve(doorDashFixture);
    await second.terminal;
    expect(runActor).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledOnce();
  });

  it('retries failed Snapshots after two minutes but keeps not-found Snapshots for six hours', async () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60_000).toISOString();
    const makeLatest = (status: 'failed' | 'not_found'): Snapshot => ({
      id: status,
      placeId: 'place-1',
      venueName: venue.name,
      fetchedAt: threeMinutesAgo,
      payload: {
        ubereats: { status: 'not_found', deals: [], menu: [] },
        doordash: { status, deals: [], menu: [] },
      },
    });
    const failedFetch = vi.fn().mockResolvedValue(venue);
    const failedService = createComparisonService({
      runActor: vi.fn().mockResolvedValue([]),
      fetchPlaceDetails: failedFetch,
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(makeLatest('failed')),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
          insertedSnapshot(payload)
        ),
      },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
      settleCapMs: 100,
    });
    const notFoundFetch = vi.fn();
    const notFoundService = createComparisonService({
      runActor: vi.fn(),
      fetchPlaceDetails: notFoundFetch,
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(makeLatest('not_found')),
        insert: vi.fn(),
      },
      freshnessMs: SNAPSHOT_FRESHNESS_MS,
      failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
      settleCapMs: 100,
    });

    await collectComparison(failedService).terminal;
    await collectComparison(notFoundService).terminal;

    expect(failedFetch).toHaveBeenCalledOnce();
    expect(notFoundFetch).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ComparisonStreamEvent, Snapshot, SnapshotPayload } from '@dinder/shared/types';
import doorDashFixture from '../fixtures/comparison/doordash-search-11-inch-pizza.json';
import { createComparisonService } from '../../src/services/ComparisonService.js';

const DOORDASH_ACTOR = 'abotapi/doordash-scraper';
const DOORDASH_URL = 'https://www.doordash.com/store/30221303/';
const venue = {
  placeId: 'place-1',
  name: '11 Inch Pizza',
  address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
  latitude: -37.8156,
  longitude: 144.9631,
};
const actorOptions = {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
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
    fetchedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
    payload: {
      ubereats: { status: 'not_found', deals: [], menu: [] },
      doordash: storefront,
    },
  };
}

describe('createComparisonService DoorDash actor', () => {
  it('searches once and captures the real Australian menu', async () => {
    const runActor = vi.fn((actorId: string) => {
      if (actorId === 'borderline/uber-eats-scraper-ppr') return Promise.resolve([]);
      if (actorId === DOORDASH_ACTOR) return Promise.resolve(doorDashFixture);
      throw new Error(`unexpected actor ${actorId}`);
    });
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      failureFreshnessMs: 2 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(runActor.mock.calls.filter(([actorId]) => actorId === DOORDASH_ACTOR)).toHaveLength(1);
    expect(runActor).toHaveBeenCalledWith(DOORDASH_ACTOR, {
      mode: 'search',
      search: [venue.name],
      location: 'Melbourne VIC 3000, Australia',
      storeType: 'restaurant',
      maxPages: 1,
      ...actorOptions,
    });
    const doorDashEvent = events.find(
      (event) => event.type === 'storefront' && event.platform === 'doordash'
    );
    expect(doorDashEvent).toMatchObject({
      type: 'storefront',
      platform: 'doordash',
      storefront: { status: 'resolved', storeUrl: DOORDASH_URL, deals: [] },
    });
    if (doorDashEvent?.type !== 'storefront') throw new Error('missing DoorDash event');
    expect(doorDashEvent.storefront.menu).toHaveLength(60);
    expect(doorDashEvent.storefront.menu).toContainEqual({
      name: 'Margherita',
      price_cents: 2300,
      section: 'Pizza',
      tags: [],
    });
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
      Promise.resolve(actorId === DOORDASH_ACTOR ? doorDashFixture : [])
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(staleSnapshot({
          status: 'resolved', storeUrl: DOORDASH_URL, deals: [], menu: [],
        })),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(runActor.mock.calls.filter(([actorId]) => actorId === DOORDASH_ACTOR)).toEqual([[
      DOORDASH_ACTOR,
      { mode: 'url', urls: [DOORDASH_URL], ...actorOptions },
    ]]);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'storefront',
      platform: 'doordash',
      storefront: expect.objectContaining({ status: 'resolved', storeUrl: DOORDASH_URL }),
    }));
  });

  it.each([
    ['fails', () => Promise.reject(new Error('store removed'))],
    ['does not resolve', () => Promise.resolve([])],
  ] as const)('falls back to search when stale URL mode %s', async (_case, firstRun) => {
    let doorDashRuns = 0;
    const runActor = vi.fn((actorId: string) => {
      if (actorId !== DOORDASH_ACTOR) return Promise.resolve([]);
      doorDashRuns += 1;
      return doorDashRuns === 1 ? firstRun() : Promise.resolve(doorDashFixture);
    });
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(staleSnapshot({
          status: 'resolved', storeUrl: DOORDASH_URL, deals: [], menu: [],
        })),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(runActor.mock.calls.filter(([actorId]) => actorId === DOORDASH_ACTOR)).toEqual([
      [DOORDASH_ACTOR, { mode: 'url', urls: [DOORDASH_URL], ...actorOptions }],
      [DOORDASH_ACTOR, {
        mode: 'search',
        search: [venue.name],
        location: 'Melbourne VIC 3000, Australia',
        storeType: 'restaurant',
        maxPages: 1,
        ...actorOptions,
      }],
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'storefront',
      platform: 'doordash',
      storefront: expect.objectContaining({ status: 'resolved' }),
    }));
  });

  it('skips noisy rows before a valid Storefront', async () => {
    const valid = { ...doorDashFixture[0], url: `${DOORDASH_URL}?delivery=true` };
    const runActor = vi.fn((actorId: string) =>
      Promise.resolve(actorId === DOORDASH_ACTOR ? [null, { name: 'partial' }, valid] : [])
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(null),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(events).toContainEqual(expect.objectContaining({
      type: 'storefront',
      platform: 'doordash',
      storefront: expect.objectContaining({ status: 'resolved', storeUrl: DOORDASH_URL }),
    }));
  });

  it.each([
    ['wrong name', { name: 'Different Restaurant' }],
    ['more than 100m away', { latitude: -37.9, longitude: 145.1 }],
    ['non-AUD currency', { currency: 'USD' }],
    ['off-domain URL', { url: 'https://example.com/store/30221303/' }],
    ['non-HTTPS URL', { url: 'http://www.doordash.com/store/30221303/' }],
  ])('rejects a Storefront with a %s', async (_case, overrides) => {
    const output = [{ ...doorDashFixture[0], ...overrides }];
    const service = createComparisonService({
      runActor: vi.fn((actorId: string) =>
        Promise.resolve(actorId === DOORDASH_ACTOR ? output : [])
      ),
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(null),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(events).toContainEqual({
      type: 'storefront',
      platform: 'doordash',
      storefront: { status: 'not_found', deals: [], menu: [] },
    });
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
        actorId === DOORDASH_ACTOR ? actorRun() : Promise.resolve([])
      ),
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      failureFreshnessMs: 2 * 60_000,
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

  it('marks a matching Storefront with an invalid menu as failed', async () => {
    const service = createComparisonService({
      runActor: vi.fn((actorId: string) => Promise.resolve(
        actorId === DOORDASH_ACTOR ? [{ ...doorDashFixture[0], menu: null }] : []
      )),
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(null),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service).terminal;

    expect(events).toContainEqual({
      type: 'storefront',
      platform: 'doordash',
      storefront: { status: 'failed', deals: [], menu: [] },
    });
  });

  it('replays settled events on reconnect without another actor run', async () => {
    const doorDashRun = deferred<unknown[]>();
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const runActor = vi.fn((actorId: string) =>
      actorId === DOORDASH_ACTOR ? doorDashRun.promise : Promise.resolve([])
    );
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue(venue),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });
    const firstEvents: ComparisonStreamEvent[] = [];
    const unsubscribe = service.subscribe('place-1', (event) => firstEvents.push(event));
    await vi.waitFor(() => expect(firstEvents).toContainEqual({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'not_found', deals: [], menu: [] },
    }));
    unsubscribe();

    const second = collectComparison(service);

    expect(second.events).toEqual(firstEvents);
    expect(runActor).toHaveBeenCalledTimes(2);
    doorDashRun.resolve(doorDashFixture);
    await second.terminal;
    expect(runActor).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledOnce();
  });

  it('retries failed Snapshots after two minutes but keeps not-found Snapshots for twenty', async () => {
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
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      failureFreshnessMs: 2 * 60_000,
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
      freshnessMs: 20 * 60_000,
      failureFreshnessMs: 2 * 60_000,
      settleCapMs: 100,
    });

    await collectComparison(failedService).terminal;
    await collectComparison(notFoundService).terminal;

    expect(failedFetch).toHaveBeenCalledOnce();
    expect(notFoundFetch).not.toHaveBeenCalled();
  });
});

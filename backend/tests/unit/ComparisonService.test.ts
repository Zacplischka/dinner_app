import { describe, expect, it, vi } from 'vitest';
import type { ComparisonStreamEvent, Snapshot, SnapshotPayload } from '@dinder/shared/types';
import uberEatsFixture from '../fixtures/comparison/ubereats-search-11-inch-pizza.json';
import { createComparisonService } from '../../src/services/ComparisonService.js';

function collectComparison(
  service: ReturnType<typeof createComparisonService>,
  placeId: string,
  beginColdCompare?: () => boolean
): Promise<ComparisonStreamEvent[]> {
  return new Promise((resolve) => {
    const events: ComparisonStreamEvent[] = [];
    service.subscribe(placeId, (event) => {
      events.push(event);
      if (event.type === 'comparison' || event.type === 'error') resolve(events);
    }, beginColdCompare ? { beginColdCompare } : undefined);
  });
}

function insertedSnapshot(payload: SnapshotPayload): Snapshot {
  return {
    id: 'snapshot-1',
    placeId: 'place-1',
    venueName: '11 Inch Pizza',
    fetchedAt: '2026-07-13T08:00:00.000Z',
    payload,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('createComparisonService', () => {
  it('resolves, slims, streams, and persists a real Uber Eats capture', async () => {
    const runActor = vi.fn().mockResolvedValue(uberEatsFixture);
    const snapshotStore = {
      getLatest: vi.fn().mockResolvedValue(null),
      insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
    };
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore,
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(runActor).toHaveBeenCalledWith('borderline/uber-eats-scraper-ppr', {
      address: 'Melbourne VIC 3000, Australia',
      addressCountry: 'AU',
      query: '11 Inch Pizza',
      storeType: 'RESTAURANTS',
      maxRows: 5,
      locale: 'en-AU',
      getMenuCustomizations: false,
    });
    const storefront = events.find(
      (event) => event.type === 'storefront' && event.platform === 'ubereats'
    );
    expect(storefront).toMatchObject({
      type: 'storefront',
      platform: 'ubereats',
      storefront: {
        status: 'resolved',
        storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/BGKvxIwATuWgM-xVHJE2lA',
        deals: ['Buy 1, get 1 free', '20% off', 'Earn $3 Uber Cash for photo'],
      },
    });
    if (storefront?.type !== 'storefront') throw new Error('missing storefront event');
    expect(storefront.storefront.menu).toHaveLength(51);
    expect(storefront.storefront.menu).toContainEqual({
      name: 'Margherita',
      price_cents: 2300,
      section: 'Pizza',
      tags: ['No. 1 most liked', '20% off'],
    });
    expect(storefront.storefront.menu).toContainEqual({
      name: 'Coke (Can)',
      price_cents: 700,
      section: 'Drinks',
      tags: ['Buy 1, get 1 free'],
    });
    expect(snapshotStore.insert).toHaveBeenCalledTimes(1);
    expect(snapshotStore.insert).toHaveBeenCalledWith({
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      payload: {
        ubereats: storefront.storefront,
        doordash: { status: 'not_found', deals: [], menu: [] },
      },
    });
    expect(events[0]?.type).toBe('venue');
    expect(events.filter((event) => event.type === 'storefront')).toHaveLength(2);
    expect(events.at(-1)?.type).toBe('comparison');
  });

  it('treats the actor no-restaurant row as not_found', async () => {
    const service = createComparisonService({
      runActor: vi.fn((actorId: string) => Promise.resolve(
        actorId === 'borderline/uber-eats-scraper-ppr'
          ? [{ error: "Scraper didn't find any restaurants" }]
          : []
      )),
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(null),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(events).toContainEqual({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'not_found', deals: [], menu: [] },
    });
  });

  it.each([
    ['off-domain', 'https://example.com/au/store/11-inch-pizza'],
    ['non-HTTPS', 'http://ubereats.com/au/store/11-inch-pizza'],
    ['malformed', 'not a URL'],
  ])('does not stream or persist an unsafe Uber Eats store URL (%s)', async (_case, url) => {
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) =>
      insertedSnapshot(payload)
    );
    const service = createComparisonService({
      runActor: vi.fn().mockResolvedValue([{
        ...uberEatsFixture[0],
        url,
      }]),
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(events).toContainEqual({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'failed', deals: [], menu: [] },
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        ubereats: { status: 'failed', deals: [], menu: [] },
      }),
    }));
    expect(JSON.stringify(events)).not.toContain(url);
  });

  it('serves a fresh Snapshot without Place Details, actor spend, or a new row', async () => {
    const capture = {
      status: 'resolved' as const,
      storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/example',
      deals: [],
      menu: [],
    };
    const freshSnapshot: Snapshot = {
      id: 'fresh',
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      fetchedAt: new Date().toISOString(),
      payload: {
        ubereats: capture,
        doordash: { status: 'not_found', deals: [], menu: [] },
      },
    };
    const runActor = vi.fn();
    const fetchPlaceDetails = vi.fn();
    const insert = vi.fn();
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails,
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(freshSnapshot), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(events).toEqual([
      { type: 'venue', placeId: 'place-1', venueName: '11 Inch Pizza' },
      { type: 'storefront', platform: 'ubereats', storefront: capture },
      {
        type: 'storefront',
        platform: 'doordash',
        storefront: { status: 'not_found', deals: [], menu: [] },
      },
      {
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: freshSnapshot.fetchedAt,
          storefronts: {
            ubereats: capture,
            doordash: { status: 'not_found', deals: [], menu: [] },
          },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      },
    ]);
    expect(fetchPlaceDetails).not.toHaveBeenCalled();
    expect(runActor).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('checks the cold-compare budget only after ruling out a fresh Snapshot', async () => {
    const freshSnapshot: Snapshot = {
      id: 'fresh',
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      fetchedAt: new Date().toISOString(),
      payload: {
        ubereats: { status: 'resolved', deals: [], menu: [] },
        doordash: { status: 'not_found', deals: [], menu: [] },
      },
    };
    const beginColdCompare = vi.fn(() => false);
    const service = createComparisonService({
      runActor: vi.fn(),
      fetchPlaceDetails: vi.fn(),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(freshSnapshot),
        insert: vi.fn(),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1', beginColdCompare);

    expect(events.at(-1)?.type).toBe('comparison');
    expect(beginColdCompare).not.toHaveBeenCalled();
  });

  it('emits a terminal SSE error before paid work when the cold budget is exhausted', async () => {
    const beginColdCompare = vi.fn(() => false);
    const runActor = vi.fn();
    const fetchPlaceDetails = vi.fn();
    const insert = vi.fn();
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails,
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1', beginColdCompare);

    expect(events).toEqual([{
      type: 'error',
      code: 'RATE_LIMITED',
      message: 'Too many comparisons. Please try again shortly.',
    }]);
    expect(beginColdCompare).toHaveBeenCalledOnce();
    expect(fetchPlaceDetails).not.toHaveBeenCalled();
    expect(runActor).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent subscribers into one actor chain and one Snapshot', async () => {
    const actorRun = deferred<unknown[]>();
    const runActor = vi.fn().mockReturnValue(actorRun.promise);
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload));
    const getLatest = vi.fn().mockResolvedValue(null);
    const fetchPlaceDetails = vi.fn().mockResolvedValue({
      placeId: 'place-1',
      name: '11 Inch Pizza',
      address: 'Melbourne VIC 3000, Australia',
      latitude: -37.8156,
      longitude: 144.9631,
    });
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails,
      snapshotStore: { getLatest, insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const first = collectComparison(service, 'place-1');
    const second = collectComparison(service, 'place-1');
    await vi.waitFor(() => expect(runActor).toHaveBeenCalledTimes(2));
    actorRun.resolve(uberEatsFixture);
    const [firstEvents, secondEvents] = await Promise.all([first, second]);

    expect(firstEvents).toEqual(secondEvents);
    expect(getLatest).toHaveBeenCalledTimes(1);
    expect(fetchPlaceDetails).toHaveBeenCalledTimes(1);
    expect(runActor).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('settles a timed-out actor as failed and still writes the Snapshot', async () => {
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload));
    const service = createComparisonService({
      runActor: vi.fn(() => new Promise<unknown[]>(() => undefined)),
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 10,
    });

    const events = await collectComparison(service, 'place-1');

    expect(events.find(
      (event) => event.type === 'storefront' && event.platform === 'ubereats'
    )).toEqual({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'failed', deals: [], menu: [] },
    });
    expect(insert).toHaveBeenCalledWith({
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      payload: {
        ubereats: { status: 'failed', deals: [], menu: [] },
        doordash: { status: 'failed', deals: [], menu: [] },
      },
    });
    expect(events.at(-1)?.type).toBe('comparison');
  });

  it('finishes and persists after every subscriber disconnects mid-flight', async () => {
    const actorRun = deferred<unknown[]>();
    const persisted = deferred<SnapshotPayload>();
    const service = createComparisonService({
      runActor: vi.fn().mockReturnValue(actorRun.promise),
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue(null),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => {
          persisted.resolve(payload);
          return insertedSnapshot(payload);
        }),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const subscriber = vi.fn();
    const unsubscribe = service.subscribe('place-1', subscriber);
    await vi.waitFor(() => expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ type: 'venue' })));
    unsubscribe();
    actorRun.resolve(uberEatsFixture);

    await expect(persisted.promise).resolves.toEqual(
      expect.objectContaining({ ubereats: expect.objectContaining({ status: 'resolved' }) })
    );
  });

  it('reuses a stale Uber Eats store URL instead of repeating name resolution', async () => {
    const storeUrl = 'https://ubereats.com/au/store/11-inch-pizza/BGKvxIwATuWgM-xVHJE2lA';
    const runActor = vi.fn().mockResolvedValue(uberEatsFixture);
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue({
          id: 'stale',
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
          payload: {
            ubereats: { status: 'resolved', storeUrl, deals: [], menu: [] },
            doordash: { status: 'not_found', deals: [], menu: [] },
          },
        }),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    await collectComparison(service, 'place-1');

    expect(runActor).toHaveBeenCalledWith('borderline/uber-eats-scraper-ppr', {
      urls: [storeUrl],
      locale: 'en-AU',
      getMenuCustomizations: false,
    });
  });

  it('falls back to name resolution when a stale Uber Eats store URL fails', async () => {
    const storeUrl = 'https://ubereats.com/au/store/11-inch-pizza/stale';
    let uberEatsRuns = 0;
    const runActor = vi.fn((actorId: string) => {
      if (actorId === 'abotapi/doordash-scraper') return Promise.resolve([]);
      uberEatsRuns += 1;
      return uberEatsRuns === 1
        ? Promise.reject(new Error('store removed'))
        : Promise.resolve(uberEatsFixture);
    });
    const service = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: {
        getLatest: vi.fn().mockResolvedValue({
          id: 'stale',
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
          payload: {
            ubereats: { status: 'resolved', storeUrl, deals: [], menu: [] },
            doordash: { status: 'not_found', deals: [], menu: [] },
          },
        }),
        insert: vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload)),
      },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(runActor.mock.calls.filter(([actorId]) =>
      actorId === 'borderline/uber-eats-scraper-ppr'
    )).toEqual([
      ['borderline/uber-eats-scraper-ppr', {
        urls: [storeUrl],
        locale: 'en-AU',
        getMenuCustomizations: false,
      }],
      ['borderline/uber-eats-scraper-ppr', {
        address: 'Melbourne VIC 3000, Australia',
        addressCountry: 'AU',
        query: '11 Inch Pizza',
        storeType: 'RESTAURANTS',
        maxRows: 5,
        locale: 'en-AU',
        getMenuCustomizations: false,
      }],
    ]);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'storefront',
      platform: 'ubereats',
      storefront: expect.objectContaining({ status: 'resolved' }),
    }));
  });

  it('records not_found when an actor result fails the name and 100m Venue check', async () => {
    const wrongVenue = [{
      ...uberEatsFixture[0],
      title: 'Different Pizza Shop',
      location: { ...uberEatsFixture[0].location, latitude: -37.9, longitude: 145.1 },
    }];
    const insert = vi.fn(async ({ payload }: { payload: SnapshotPayload }) => insertedSnapshot(payload));
    const service = createComparisonService({
      runActor: vi.fn().mockResolvedValue(wrongVenue),
      fetchPlaceDetails: vi.fn().mockResolvedValue({
        placeId: 'place-1',
        name: '11 Inch Pizza',
        address: 'Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      }),
      snapshotStore: { getLatest: vi.fn().mockResolvedValue(null), insert },
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });

    const events = await collectComparison(service, 'place-1');

    expect(events.find(
      (event) => event.type === 'storefront' && event.platform === 'ubereats'
    )).toEqual({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'not_found', deals: [], menu: [] },
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        ubereats: { status: 'not_found', deals: [], menu: [] },
        doordash: { status: 'not_found', deals: [], menu: [] },
      },
    }));
  });
});

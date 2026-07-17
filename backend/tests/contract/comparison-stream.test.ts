import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComparisonStreamEvent, Snapshot, SnapshotPayload } from '@dinder/shared/types';
import { createComparisonRouter } from '../../src/api/comparison.js';
import { createComparisonService } from '../../src/services/ComparisonService.js';
import { logger } from '../../src/logger.js';
import { captureLogs } from '../helpers/logCapture.js';

describe('GET /api/comparison/:placeId/stream', () => {
  it('streams named Venue, Storefront, and terminal Comparison events to a guest', async () => {
    const unsubscribe = vi.fn();
    const events: ComparisonStreamEvent[] = [
      { type: 'venue', placeId: 'place-1', venueName: '11 Inch Pizza' },
      {
        type: 'storefront',
        platform: 'ubereats',
        storefront: {
          status: 'resolved',
          storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/example',
          deals: [],
          menu: [],
        },
      },
      {
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: '2026-07-13T08:00:00.000Z',
          storefronts: {
            ubereats: { status: 'resolved', deals: [], menu: [] },
            doordash: { status: 'not_found', deals: [], menu: [] },
          },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      },
    ];
    const comparisonService = {
      subscribe: vi.fn((_placeId, subscriber: (event: ComparisonStreamEvent) => void) => {
        queueMicrotask(() => events.forEach(subscriber));
        return unsubscribe;
      }),
    };
    const app = express();
    app.use(
      '/api/comparison',
      createComparisonRouter({
        searchNearbyVenues: vi.fn(),
        comparisonService,
      })
    );

    const response = await request(app).get('/api/comparison/place-1/stream').expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain(
      'event: venue\ndata: {"placeId":"place-1","venueName":"11 Inch Pizza"}\n\n'
    );
    expect(response.text).toContain('event: storefront\ndata: {"platform":"ubereats"');
    expect(response.text).toContain('event: comparison\ndata: {"comparison":');
    expect(comparisonService.subscribe).toHaveBeenCalledWith('place-1', expect.any(Function), {
      beginColdCompare: expect.any(Function),
    });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });
});

describe('Comparison subscribe source tag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildLoggingApp() {
    const comparisonService = {
      subscribe: vi.fn((_placeId, subscriber: (event: ComparisonStreamEvent) => void) => {
        queueMicrotask(() =>
          subscriber({ type: 'error', code: 'COMPARISON_FAILED', message: 'stubbed' })
        );
        return vi.fn();
      }),
    };
    const app = express();
    app.use(pinoHttp({ logger }));
    app.use(
      '/api/comparison',
      createComparisonRouter({
        searchNearbyVenues: vi.fn(),
        comparisonService,
      })
    );
    return app;
  }

  it('logs the tap source with the place ID in server-countable form', async () => {
    const app = buildLoggingApp();
    const logs = captureLogs();

    await request(app).get('/api/comparison/place-1/stream?source=match_card');

    expect(logs.withMsg('Comparison subscribe')[0]).toMatchObject({
      placeId: 'place-1',
      source: 'match_card',
    });
  });

  it('logs organic subscribes without a source and drops unknown source values', async () => {
    const app = buildLoggingApp();
    const logs = captureLogs();

    await request(app).get('/api/comparison/place-1/stream');
    await request(app).get('/api/comparison/place-2/stream?source=<script>');

    const lines = logs.withMsg('Comparison subscribe');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ placeId: 'place-1' });
    expect(lines[0]).not.toHaveProperty('source');
    expect(lines[1]).toMatchObject({ placeId: 'place-2' });
    expect(lines[1]).not.toHaveProperty('source');
  });
});

describe('per-IP rate limit on cold Comparisons', () => {
  // Router + real ComparisonService over in-memory fakes: the contract seam is
  // the HTTP behavior, including which requests consume the cold-compare budget.
  function buildApp(runActor = vi.fn().mockResolvedValue([])) {
    const snapshots = new Map<string, Snapshot>();
    const snapshotStore = {
      getLatest: async (placeId: string) => snapshots.get(placeId) ?? null,
      insert: async (input: { placeId: string; venueName: string; payload: SnapshotPayload }) => {
        const snapshot: Snapshot = {
          id: `snapshot-${input.placeId}`,
          placeId: input.placeId,
          venueName: input.venueName,
          fetchedAt: new Date().toISOString(),
          payload: input.payload,
        };
        snapshots.set(input.placeId, snapshot);
        return snapshot;
      },
    };
    const comparisonService = createComparisonService({
      runActor,
      fetchPlaceDetails: vi.fn(async (placeId: string) => ({
        placeId,
        name: '11 Inch Pizza',
        address: '353 Little Collins St, Melbourne VIC 3000, Australia',
        latitude: -37.8156,
        longitude: 144.9631,
      })),
      snapshotStore,
      freshnessMs: 20 * 60_000,
      settleCapMs: 100,
    });
    const app = express();
    app.use(
      '/api/comparison',
      createComparisonRouter({
        searchNearbyVenues: vi.fn(),
        comparisonService,
      })
    );
    return { app, snapshots, snapshotStore, runActor };
  }

  async function coldCompare(app: express.Express, placeId: string) {
    return request(app).get(`/api/comparison/${placeId}/stream`);
  }

  it('allows five cold Comparisons per IP and streams each to completion', async () => {
    const { app } = buildApp();

    for (let i = 1; i <= 5; i++) {
      const response = await coldCompare(app, `place-${i}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('event: comparison');
    }
  });

  it('returns the sixth cold Comparison as a 429 naming the limit and retry timing', async () => {
    const { app } = buildApp();
    for (let i = 1; i <= 5; i++) await coldCompare(app, `place-${i}`);

    const limited = await coldCompare(app, 'place-6');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
    });
    expect(limited.body.message).toMatch(/5 new comparisons per hour/i);
    expect(limited.body.message).toMatch(/minute/i);
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it('serves fresh-Snapshot Comparisons unthrottled and without consuming budget', async () => {
    const { app, snapshotStore } = buildApp();
    await snapshotStore.insert({
      placeId: 'warm-place',
      venueName: '11 Inch Pizza',
      payload: {
        ubereats: { status: 'not_found', deals: [], menu: [] },
        doordash: { status: 'not_found', deals: [], menu: [] },
      },
    });

    // Warm reads before, between, and after exhausting the cold budget all succeed.
    expect((await coldCompare(app, 'warm-place')).status).toBe(200);
    for (let i = 1; i <= 5; i++) {
      expect((await coldCompare(app, `place-${i}`)).status).toBe(200);
    }
    expect((await coldCompare(app, 'place-6')).status).toBe(429);
    const warm = await coldCompare(app, 'warm-place');
    expect(warm.status).toBe(200);
    expect(warm.text).toContain('event: comparison');
  });

  it('counts concurrent subscribers deduped onto one flight as a single cold Comparison', async () => {
    let releaseActors!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseActors = resolve;
    });
    const runActor = vi.fn(async () => {
      await gate;
      return [];
    });
    const { app } = buildApp(runActor);

    const first = coldCompare(app, 'shared-place');
    const second = coldCompare(app, 'shared-place');
    // One flight fetches both platforms: exactly two actor runs, not four.
    await vi.waitFor(() => expect(runActor).toHaveBeenCalledTimes(2));
    releaseActors();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.text).toContain('event: comparison');
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.text).toContain('event: comparison');

    // The deduped flight consumed one budget slot: four more colds fit, the fifth does not.
    for (let i = 1; i <= 4; i++) {
      expect((await coldCompare(app, `place-${i}`)).status).toBe(200);
    }
    expect((await coldCompare(app, 'place-5')).status).toBe(429);
  });
});

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ComparisonStreamEvent } from '@dinder/shared/types';
import { createComparisonRouter } from '../../src/api/comparison.js';

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
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn(),
      comparisonService,
    }));

    const response = await request(app).get('/api/comparison/place-1/stream').expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain(
      'event: venue\ndata: {"placeId":"place-1","venueName":"11 Inch Pizza"}\n\n'
    );
    expect(response.text).toContain('event: storefront\ndata: {"platform":"ubereats"');
    expect(response.text).toContain('event: comparison\ndata: {"comparison":');
    expect(comparisonService.subscribe).toHaveBeenCalledWith(
      'place-1',
      expect.any(Function),
      { beginColdCompare: expect.any(Function) }
    );
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('returns the sixth cold compare as a friendly terminal SSE error on HTTP 200', async () => {
    const comparisonService = {
      subscribe: vi.fn((_placeId, subscriber, options) => {
        queueMicrotask(() => {
          if (!options?.beginColdCompare?.()) {
            subscriber({
              type: 'error',
              code: 'RATE_LIMITED',
              message: 'Too many comparisons. Please try again shortly.',
            });
            return;
          }
          subscriber({
            type: 'comparison',
            comparison: {
              placeId: 'place-1',
              venueName: '11 Inch Pizza',
              fetchedAt: '2026-07-13T08:00:00.000Z',
              storefronts: {
                ubereats: { status: 'not_found', deals: [], menu: [] },
                doordash: { status: 'not_found', deals: [], menu: [] },
              },
              matchedItems: [],
              unmatched: { ubereats: [], doordash: [] },
            },
          });
        });
        return vi.fn();
      }),
    };
    const app = express();
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn(),
      comparisonService,
    }));

    for (let requestNumber = 1; requestNumber <= 5; requestNumber++) {
      const response = await request(app).get(`/api/comparison/place-${requestNumber}/stream`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('event: comparison');
    }
    const limited = await request(app).get('/api/comparison/place-6/stream');

    expect(limited.status).toBe(200);
    expect(limited.text).toContain('event: error');
    expect(limited.text).toContain('"code":"RATE_LIMITED"');
    expect(limited.text).toContain('Too many comparisons. Please try again shortly.');
  });
});

import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRedirectRouter } from '../../src/api/redirect.js';
import { logger } from '../../src/logger.js';
import { captureLogs } from '../helpers/logCapture.js';

describe('GET /api/redirect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fetchPlaceDetails = vi.fn(async (placeId: string) => ({
    placeId,
    name: '11 Inch Pizza',
    address: '353 Little Collins St, Melbourne VIC 3000, Australia',
    latitude: -37.8156,
    longitude: 144.9631,
  }));

  function fakeCache() {
    const store = new Map<string, string>();
    return {
      store,
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK' as const;
      }),
    };
  }

  function buildApp(targetCache?: ReturnType<typeof fakeCache>) {
    fetchPlaceDetails.mockClear();
    const app = express();
    app.use(pinoHttp({ logger }));
    app.use('/api/redirect', createRedirectRouter({ fetchPlaceDetails, targetCache }));
    return app;
  }

  it('302-redirects to the Uber Eats public search link for the resolved Venue', async () => {
    const response = await request(buildApp()).get(
      '/api/redirect?platform=ubereats&placeId=place-1&source=near_miss'
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `https://www.ubereats.com/search?q=${encodeURIComponent(
        '11 Inch Pizza 353 Little Collins St, Melbourne VIC 3000, Australia'
      )}`
    );
  });

  it('302-redirects to the DoorDash public search link for the resolved Venue', async () => {
    const response = await request(buildApp()).get(
      '/api/redirect?platform=doordash&placeId=place-1&source=near_miss'
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `https://www.doordash.com/search/store/${encodeURIComponent(
        '11 Inch Pizza 353 Little Collins St, Melbourne VIC 3000, Australia'
      )}/`
    );
  });

  it('emits one countable log line tagging platform, place ID, and source', async () => {
    const app = buildApp();
    const logs = captureLogs();

    await request(app).get('/api/redirect?platform=ubereats&placeId=place-1&source=near_miss');

    expect(logs.withMsg('Delivery redirect')[0]).toMatchObject({
      platform: 'ubereats',
      placeId: 'place-1',
      source: 'near_miss',
    });
  });

  it('serves repeat taps from the cache without a second paid Places lookup', async () => {
    const cache = fakeCache();
    const app = buildApp(cache);

    const first = await request(app).get(
      '/api/redirect?platform=ubereats&placeId=place-1&source=near_miss'
    );
    const second = await request(app).get(
      '/api/redirect?platform=ubereats&placeId=place-1&source=near_miss'
    );

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe(first.headers.location);
    expect(fetchPlaceDetails).toHaveBeenCalledTimes(1);
  });

  it('rate-limits uncached redirects per IP so anonymous taps cannot run up Places spend', async () => {
    const app = buildApp();

    for (let i = 1; i <= 30; i++) {
      const response = await request(app).get(
        `/api/redirect?platform=ubereats&placeId=place-${i}&source=near_miss`
      );
      expect(response.status).toBe(302);
    }
    const limited = await request(app).get(
      '/api/redirect?platform=ubereats&placeId=place-31&source=near_miss'
    );

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rejects unknown platforms, unknown sources, and missing parameters with 400', async () => {
    const app = buildApp();
    const badRequests = [
      '/api/redirect?platform=menulog&placeId=place-1&source=near_miss',
      '/api/redirect?platform=ubereats&source=near_miss',
      '/api/redirect?platform=ubereats&placeId=place-1&source=tracking_pixel',
      '/api/redirect?platform=ubereats&placeId=place-1',
      '/api/redirect',
    ];

    for (const url of badRequests) {
      const response = await request(app).get(url);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRedirectRouter } from '../../src/api/redirect.js';
import { logger } from '../../src/logger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
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
    app.use(errorHandler);
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
    expect(limited.body).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many delivery links opened. Please try again later.',
    });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  // The Shopping List's Retailer links ride the same seam (#228, #238): the tap
  // is counted server-side, then 302s to Woolworths' own web page.
  describe('Retailer links', () => {
    it('302-redirects a Stockcode to the Woolworths product page', async () => {
      const response = await request(buildApp()).get(
        '/api/redirect?retailer=woolworths&stockcode=12345'
      );

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        'https://www.woolworths.com.au/shop/productdetails/12345'
      );
    });

    it('302-redirects an Unmatched line to a Woolworths search', async () => {
      const response = await request(buildApp()).get(
        '/api/redirect?retailer=woolworths&q=coriander%20leaves'
      );

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        'https://www.woolworths.com.au/shop/search/products?searchTerm=coriander%20leaves'
      );
    });

    it('emits one countable log line and pays for no Places lookup', async () => {
      const app = buildApp();
      const logs = captureLogs();

      await request(app).get('/api/redirect?retailer=woolworths&stockcode=12345');

      expect(logs.withMsg('Retailer redirect')[0]).toMatchObject({
        retailer: 'woolworths',
        stockcode: '12345',
      });
      expect(fetchPlaceDetails).not.toHaveBeenCalled();
    });

    it('rejects unknown Retailers and a target it cannot name with 400', async () => {
      const app = buildApp();
      const badRequests = [
        '/api/redirect?retailer=coles&stockcode=12345',
        '/api/redirect?retailer=woolworths',
        '/api/redirect?retailer=woolworths&stockcode=abc',
        '/api/redirect?retailer=woolworths&q=',
      ];

      for (const url of badRequests) {
        const response = await request(app).get(url);
        expect(response.status, url).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      }
    });
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
      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        message:
          'platform (ubereats|doordash), placeId, and source (match_card|near_miss) are required',
      });
    }
  });
});

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComparisonRouter } from '../../src/api/comparison.js';
import { searchNearbyVenues } from '../../src/services/RestaurantSearchService.js';
import { app as productionApp } from '../../src/server.js';

describe('GET /api/comparison/venues', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns nearby Venues to a guest using only Google Places', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          id: 'place-1',
          displayName: { text: '11 Inch Pizza' },
          rating: 4.6,
          primaryType: 'pizza_restaurant',
          primaryTypeDisplayName: { text: 'Pizza restaurant' },
          formattedAddress: '7A/353 Little Collins St, Melbourne VIC 3000',
          location: { latitude: -37.8156157, longitude: 144.9630536 },
        }],
      }),
      headers: { get: () => null },
    });
    global.fetch = fetchMock;

    const app = express();
    const reverseGeocodeSuburb = vi.fn().mockResolvedValue('Melbourne');
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues,
      reverseGeocodeSuburb,
    }));

    const response = await request(app)
      .get('/api/comparison/venues')
      .query({ latitude: -37.8136, longitude: 144.9631, radiusMiles: 5 })
      .expect(200);

    expect(response.body.venues).toEqual([expect.objectContaining({
      placeId: 'place-1',
      name: '11 Inch Pizza',
      rating: 4.6,
      cuisineType: 'Pizza restaurant',
      distanceMiles: expect.any(Number),
    })]);
    expect(response.body.venues[0].distanceMiles).toBeCloseTo(0.14, 1);
    expect(response.body.suburb).toBe('Melbourne');
    expect(reverseGeocodeSuburb).toHaveBeenCalledWith(-37.8136, 144.9631);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:searchText');
  });

  it('returns nearby Venues when reverse geocoding fails', async () => {
    const venues = [{ placeId: 'place-1', name: '11 Inch Pizza' }];
    const app = express();
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn().mockResolvedValue(venues),
      reverseGeocodeSuburb: vi.fn().mockRejectedValue(new Error('geocoder unavailable')),
    }));

    const response = await request(app)
      .get('/api/comparison/venues')
      .query({ latitude: -37.8136, longitude: 144.9631, radiusMiles: 5 })
      .expect(200);

    expect(response.body).toEqual({ venues });
  });

  it('trusts the Railway edge proxy so rate limits use the client IP', () => {
    expect(productionApp.get('trust proxy')).toBe(1);
  });

  it('limits venue browsing by Railway X-Real-IP instead of proxy forwarding headers', async () => {
    const searchNearbyVenues = vi.fn().mockResolvedValue([]);
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/comparison', createComparisonRouter({ searchNearbyVenues }));
    const url = '/api/comparison/venues?latitude=-37.81&longitude=144.96&radiusMiles=5';

    for (let requestNumber = 1; requestNumber <= 30; requestNumber++) {
      await request(app)
        .get(url)
        .set('X-Real-IP', '203.0.113.10')
        .set('X-Forwarded-For', `198.51.100.${requestNumber}`)
        .expect(200);
    }
    await request(app)
      .get(url)
      .set('X-Real-IP', '203.0.113.11')
      .set('X-Forwarded-For', '198.51.100.31')
      .expect(200);
    const limited = await request(app)
      .get(url)
      .set('X-Real-IP', '203.0.113.10')
      .set('X-Forwarded-For', '198.51.100.32')
      .expect(429);

    expect(searchNearbyVenues).toHaveBeenCalledTimes(31);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.body).toEqual({
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: 'Too many venue searches. Please try again shortly.',
    });
  });

  it('rejects invalid coordinates and radius without calling Google', async () => {
    const searchNearbyVenues = vi.fn().mockResolvedValue([]);
    const app = express();
    app.use('/api/comparison', createComparisonRouter({ searchNearbyVenues }));

    const response = await request(app)
      .get('/api/comparison/venues?latitude=91&longitude=144.96&radiusMiles=16')
      .expect(400);

    expect(response.body).toEqual({
      error: 'Bad Request',
      code: 'VALIDATION_ERROR',
      message: 'Valid latitude, longitude, and radiusMiles (1–15) are required',
    });
    expect(searchNearbyVenues).not.toHaveBeenCalled();
  });

  it('rejects blank coordinates instead of treating them as zero', async () => {
    const searchNearbyVenues = vi.fn().mockResolvedValue([]);
    const app = express();
    app.use('/api/comparison', createComparisonRouter({ searchNearbyVenues }));

    const response = await request(app)
      .get('/api/comparison/venues?latitude=&longitude=&radiusMiles=5')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(searchNearbyVenues).not.toHaveBeenCalled();
  });
});

describe('GET /api/comparison/photo', () => {
  it('redirects a validated photo name through a server-authenticated lookup', async () => {
    const fetchPlacePhoto = vi.fn().mockResolvedValue(
      'https://lh3.googleusercontent.com/photo.jpg'
    );
    const app = express();
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn(),
      fetchPlacePhoto,
    }));

    const response = await request(app)
      .get('/api/comparison/photo')
      .query({ name: 'places/abc/photos/def' })
      .expect(302);

    expect(response.headers.location).toBe('https://lh3.googleusercontent.com/photo.jpg');
    expect(response.headers['cache-control']).toBe('private, max-age=3600');
    expect(fetchPlacePhoto).toHaveBeenCalledWith('places/abc/photos/def');
  });

  it('limits authenticated Google photo lookups per client IP', async () => {
    const fetchPlacePhoto = vi.fn().mockResolvedValue(
      'https://lh3.googleusercontent.com/photo.jpg'
    );
    const app = express();
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn(),
      fetchPlacePhoto,
    }));
    const url = '/api/comparison/photo?name=places%2Fabc%2Fphotos%2Fdef';

    for (let requestNumber = 1; requestNumber <= 60; requestNumber++) {
      await request(app).get(url).set('X-Real-IP', '203.0.113.20').expect(302);
    }
    await request(app).get(url).set('X-Real-IP', '203.0.113.21').expect(302);
    const limited = await request(app)
      .get(url)
      .set('X-Real-IP', '203.0.113.20')
      .expect(429);

    expect(fetchPlacePhoto).toHaveBeenCalledTimes(61);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rejects malformed photo names without calling Google', async () => {
    const fetchPlacePhoto = vi.fn();
    const app = express();
    app.use('/api/comparison', createComparisonRouter({
      searchNearbyVenues: vi.fn(),
      fetchPlacePhoto,
    }));

    const response = await request(app)
      .get('/api/comparison/photo')
      .query({ name: 'https://attacker.example/photo' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(fetchPlacePhoto).not.toHaveBeenCalled();
  });
});

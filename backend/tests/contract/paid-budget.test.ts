// The global paid-API budget (#502), end to end through the production app:
// once a SKU's daily ceiling is spent, its surface answers RATE_LIMITED and the
// paid call never goes out. The ceiling is dropped to zero in this process
// rather than the shared counter filled, so a parallel suite on the same Redis
// never sees a spent budget it did not spend.
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, sessionService } from '../../src/server.js';
import { createComparisonRouter } from '../../src/api/comparison.js';
import { config } from '../../src/config/index.js';
import { createComparisonService } from '../../src/services/ComparisonService.js';
import { DomainError } from '../../src/services/DomainError.js';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';
import * as apifyClient from '../../src/services/apifyClient.js';
import * as comparisonSnapshotStore from '../../src/store/comparisonSnapshotStore.js';

describe('the global paid-API budget', () => {
  const ceilings = { ...config.paidBudget };
  afterEach(() => {
    Object.assign(config.paidBudget, ceilings);
    vi.restoreAllMocks();
  });

  it('refuses a lobby start in a new area as RATE_LIMITED once Text Search is spent', async () => {
    config.paidBudget.placesTextSearch = 0;
    const search = vi
      .spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
      .mockResolvedValue([{ placeId: 'place-1', name: 'R1' }]);
    const { sessionCode } = await sessionService.createSession('Alice', {
      branch: 'eatout',
      location: { latitude: -37.8136, longitude: 144.9631 },
      searchRadiusMiles: 5,
    });
    const { lobby } = await sessionService.joinSession(sessionCode, 'alice', 'Alice');
    const ready = await sessionService.setReady(sessionCode, 'alice', lobby!.revision, true);

    await expect(sessionService.startRound(sessionCode, 'alice', ready.revision)).rejects.toThrow(
      expect.objectContaining({
        code: 'RATE_LIMITED',
        message: expect.stringMatching(/daily search limit/),
      })
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('refuses a venue search on the same Text Search budget, before any billed Geocoding', async () => {
    config.paidBudget.placesTextSearch = 0;
    const search = vi.spyOn(RestaurantSearchService, 'searchNearbyVenues').mockResolvedValue([]);
    const geocode = vi
      .spyOn(RestaurantSearchService, 'reverseGeocodeSuburb')
      .mockResolvedValue(undefined);

    const response = await request(app)
      .get('/api/comparison/venues')
      .query({ latitude: -37.8136, longitude: 144.9631, radiusMiles: 5 })
      .expect(503);

    expect(response.body.code).toBe('RATE_LIMITED');
    expect(search).not.toHaveBeenCalled();
    expect(geocode).not.toHaveBeenCalled();
  });

  it('refuses a photo cache miss as RATE_LIMITED, not a 500', async () => {
    config.paidBudget.placePhoto = 0;
    const fetchPhoto = vi
      .spyOn(RestaurantSearchService, 'fetchPlacePhoto')
      .mockResolvedValue('https://lh3.googleusercontent.com/photo.jpg');

    const response = await request(app)
      .get('/api/comparison/photo')
      .query({ name: `places/budget${Date.now()}/photos/spent` })
      .expect(503);

    expect(response.body.code).toBe('RATE_LIMITED');
    expect(fetchPhoto).not.toHaveBeenCalled();
  });

  it('streams a cold Comparison refusal as a RATE_LIMITED event before any Apify run', async () => {
    config.paidBudget.coldComparison = 0;
    vi.spyOn(comparisonSnapshotStore, 'getLatest').mockResolvedValue(null);
    const details = vi.spyOn(RestaurantSearchService, 'fetchPlaceDetails').mockResolvedValue(venue);
    const actor = vi.spyOn(apifyClient, 'runApifyActor').mockResolvedValue([]);

    const response = await request(app).get('/api/comparison/budget-place/stream').expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toMatch(/^event: error\ndata: \{"code":"RATE_LIMITED",/);
    expect(response.text).toContain('monthly limit');
    // A spent month bills nothing: not Apify, and not Google's Place Details either.
    expect(details).not.toHaveBeenCalled();
    expect(actor).not.toHaveBeenCalled();
  });
});

const venue = {
  placeId: 'budget-place',
  name: '11 Inch Pizza',
  address: '353 Little Collins St, Melbourne VIC 3000, Australia',
  latitude: -37.8156,
  longitude: 144.9631,
};

describe('the cold-Comparison budget and the per-IP hourly window', () => {
  function buildApp(budget: { checked: boolean; spent: boolean }) {
    const refusal = () => new DomainError('RATE_LIMITED', 'The monthly limit is spent.');
    const fetchPlaceDetails = vi.fn(async (placeId: string) => ({ ...venue, placeId }));
    const runActor = vi.fn().mockResolvedValue([]);
    const comparisonService = createComparisonService({
      runActor,
      fetchPlaceDetails,
      snapshotStore: {
        getLatest: async () => null,
        insert: async (input) => ({
          ...input,
          id: 'snapshot',
          fetchedAt: new Date().toISOString(),
        }),
      },
      checkColdComparison: async () => {
        if (budget.checked) throw refusal();
      },
      spendColdComparison: async () => {
        if (budget.spent) throw refusal();
      },
    });
    const app = express();
    app.use(
      '/api/comparison',
      createComparisonRouter({ searchNearbyVenues: vi.fn(), comparisonService })
    );
    return { app, fetchPlaceDetails, runActor };
  }

  // A spent month is the app's refusal, not the caller's, and it must cost
  // nothing: no Place Details, and the caller's hour untouched — otherwise the
  // sixth Retry would read as a misleading "5 per hour" 429.
  it('refuses a spent month before Place Details, without spending the caller hour', async () => {
    const budget = { checked: true, spent: true };
    const { app, fetchPlaceDetails, runActor } = buildApp(budget);

    for (let i = 1; i <= 20; i++) {
      const refused = await request(app).get(`/api/comparison/place-${i}/stream`).expect(200);
      expect(refused.text).toContain('"code":"RATE_LIMITED"');
    }
    expect(fetchPlaceDetails).not.toHaveBeenCalled();
    expect(runActor).not.toHaveBeenCalled();

    Object.assign(budget, { checked: false, spent: false });
    for (let i = 1; i <= 5; i++) {
      const compared = await request(app).get(`/api/comparison/next-${i}/stream`).expect(200);
      expect(compared.text).toContain('event: comparison');
    }
    expect((await request(app).get('/api/comparison/next-6/stream')).status).toBe(429);
  });

  // The month ran out between the check and the spend: Place Details was
  // billed, so that compare keeps its hourly slot and the window still closes.
  it('keeps the hourly slot when the month runs out after Place Details', async () => {
    const { app, fetchPlaceDetails, runActor } = buildApp({ checked: false, spent: true });

    for (let i = 1; i <= 5; i++) {
      const refused = await request(app).get(`/api/comparison/place-${i}/stream`).expect(200);
      expect(refused.text).toContain('"code":"RATE_LIMITED"');
    }
    expect(fetchPlaceDetails).toHaveBeenCalledTimes(5);
    expect(runActor).not.toHaveBeenCalled();
    expect((await request(app).get('/api/comparison/place-6/stream')).status).toBe(429);
    expect(fetchPlaceDetails).toHaveBeenCalledTimes(5);
  });
});

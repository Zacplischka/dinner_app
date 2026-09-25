// The global paid-API budget (#502), end to end through the production app:
// once a SKU's daily ceiling is spent, its surface answers RATE_LIMITED and the
// paid call never goes out. The ceiling is dropped to zero in this process
// rather than the shared counter filled, so a parallel suite on the same Redis
// never sees a spent budget it did not spend.
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server.js';
import { config } from '../../src/config/index.js';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';
import * as apifyClient from '../../src/services/apifyClient.js';
import * as comparisonSnapshotStore from '../../src/store/comparisonSnapshotStore.js';

describe('the global paid-API budget', () => {
  const ceilings = { ...config.paidBudget };
  afterEach(() => {
    Object.assign(config.paidBudget, ceilings);
    vi.restoreAllMocks();
  });

  it('refuses Session create in a new area as RATE_LIMITED once Text Search is spent', async () => {
    config.paidBudget.placesTextSearch = 0;
    const search = vi
      .spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
      .mockResolvedValue([{ placeId: 'place-1', name: 'R1' }]);

    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: -37.8136, longitude: 144.9631 },
        searchRadiusMiles: 5,
      })
      .expect(503);

    expect(response.body).toEqual({
      code: 'RATE_LIMITED',
      message: expect.stringMatching(/daily search limit/),
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('refuses a venue search on the same Text Search budget', async () => {
    config.paidBudget.placesTextSearch = 0;
    const search = vi.spyOn(RestaurantSearchService, 'searchNearbyVenues').mockResolvedValue([]);
    vi.spyOn(RestaurantSearchService, 'reverseGeocodeSuburb').mockResolvedValue(undefined);

    const response = await request(app)
      .get('/api/comparison/venues')
      .query({ latitude: -37.8136, longitude: 144.9631, radiusMiles: 5 })
      .expect(503);

    expect(response.body.code).toBe('RATE_LIMITED');
    expect(search).not.toHaveBeenCalled();
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

  it('streams a cold Comparison refusal as a RATE_LIMITED event before any paid work', async () => {
    config.paidBudget.coldComparison = 0;
    vi.spyOn(comparisonSnapshotStore, 'getLatest').mockResolvedValue(null);
    const details = vi
      .spyOn(RestaurantSearchService, 'fetchPlaceDetails')
      .mockRejectedValue(new Error('Place Details must not be called'));
    const actor = vi.spyOn(apifyClient, 'runApifyActor').mockResolvedValue([]);

    const response = await request(app).get('/api/comparison/budget-place/stream').expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toMatch(/^event: error\ndata: \{"code":"RATE_LIMITED","message":"/);
    expect(details).not.toHaveBeenCalled();
    expect(actor).not.toHaveBeenCalled();
  });
});

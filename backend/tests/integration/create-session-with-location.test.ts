import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';

describe('POST /api/sessions with location', () => {
  let createdSessionCode: string;

  afterEach(async () => {
    if (createdSessionCode) {
      await redis.del(`session:${createdSessionCode}`);
      await redis.del(`session:${createdSessionCode}:restaurant_ids`);
      await redis.del(`session:${createdSessionCode}:restaurants`);
    }
    vi.restoreAllMocks();
  });

  it('should open an Eat Out lobby on the area, searching nothing until the host starts', async () => {
    const search = vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants');

    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'San Francisco, CA',
        },
        searchRadiusMiles: 5,
      })
      .expect(201);

    createdSessionCode = response.body.sessionCode;

    expect(response.body).toMatchObject({
      sessionCode: expect.stringMatching(/^[A-Z0-9]{5}$/),
      hostName: 'Alice',
      branch: 'eatout',
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      },
      searchRadiusMiles: 5,
      lobby: { location: { latitude: 37.7749, longitude: -122.4194 }, searchRadiusMiles: 5 },
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('should allow creating session without location (backward compatibility)', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        // location missing - should work for backward compatibility
      })
      .expect(201);

    createdSessionCode = response.body.sessionCode;

    expect(response.body.hostName).toBe('Alice');
    expect(response.body.location).toBeUndefined();
  });

  it('should default searchRadiusMiles to 5 if not provided', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: 37.7749, longitude: -122.4194 },
      })
      .expect(201);

    createdSessionCode = response.body.sessionCode;

    expect(response.body.searchRadiusMiles).toBe(5);
  });

  it('should validate searchRadiusMiles is between 1 and 15', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: 37.7749, longitude: -122.4194 },
        searchRadiusMiles: 20, // Out of range
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('should create session with location and restaurants', async () => {
    // Mock RestaurantSearchService
    vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
      .mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
        { placeId: 'place2', name: 'R2', rating: 4.2, priceLevel: 3 },
      ]);

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
      sessionCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
      hostName: 'Alice',
      restaurantCount: 2,
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      },
      searchRadiusMiles: 5,
    });
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

  it('should return 400 if no restaurants found', async () => {
    vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
      .mockResolvedValue([]);

    const response = await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: 37.7749, longitude: -122.4194 },
        searchRadiusMiles: 5,
      })
      .expect(400);

    expect(response.body.code).toBe('NO_RESTAURANTS_FOUND');
  });

  it('should default searchRadiusMiles to 5 if not provided', async () => {
    vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
      .mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);

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

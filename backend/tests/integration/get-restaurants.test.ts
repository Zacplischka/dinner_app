import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';

describe('GET /api/options/:sessionCode', () => {
  const sessionCode = 'TEST12';

  beforeEach(async () => {
    // Set up test session with restaurants
    await redis.hset(`session:${sessionCode}`, {
      state: 'waiting',
      hostId: 'host-123',
      participantCount: '1',
      createdAt: Math.floor(Date.now() / 1000).toString(),
      lastActivityAt: Math.floor(Date.now() / 1000).toString(),
    });

    const restaurant1 = {
      placeId: 'place1',
      name: 'Pizza Palace',
      rating: 4.5,
      priceLevel: 2,
      cuisineType: 'Italian',
      address: '123 Main St',
    };

    await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');
    await redis.hset(
      `session:${sessionCode}:restaurants`,
      'place1',
      JSON.stringify(restaurant1)
    );
  });

  afterEach(async () => {
    await redis.del(`session:${sessionCode}`);
    await redis.del(`session:${sessionCode}:restaurant_ids`);
    await redis.del(`session:${sessionCode}:restaurants`);
  });

  it('should return restaurants for valid session', async () => {
    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(200);

    expect(response.body).toEqual({
      restaurants: [
        {
          placeId: 'place1',
          name: 'Pizza Palace',
          rating: 4.5,
          priceLevel: 2,
          cuisineType: 'Italian',
          address: '123 Main St',
        },
      ],
      sessionCode: 'TEST12',
    });
  });

  it('should return 404 for invalid session code format', async () => {
    const response = await request(app)
      .get('/api/options/invalid')
      .expect(404);

    expect(response.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .get('/api/options/NOTFND')
      .expect(404);

    expect(response.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should return 404 if session has no restaurants', async () => {
    await redis.del(`session:${sessionCode}:restaurants`);
    await redis.del(`session:${sessionCode}:restaurant_ids`);

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(404);

    expect(response.body.code).toBe('NO_RESTAURANTS');
  });

  it('should handle multiple restaurants', async () => {
    const restaurant2 = {
      placeId: 'place2',
      name: 'Burger Bar',
      rating: 4.2,
      priceLevel: 1,
      cuisineType: 'American',
      address: '456 Oak Ave',
    };

    await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place2');
    await redis.hset(
      `session:${sessionCode}:restaurants`,
      'place2',
      JSON.stringify(restaurant2)
    );

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(200);

    expect(response.body.restaurants).toHaveLength(2);
    expect(response.body.restaurants.map((r: any) => r.placeId)).toContain('place1');
    expect(response.body.restaurants.map((r: any) => r.placeId)).toContain('place2');
  });
});

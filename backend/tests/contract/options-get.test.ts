import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, waitForRedis } from '../helpers/testSetup.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Contract Test: GET /api/options/:sessionCode', () => {
  const redis = getTestRedis();
  const sessionCode = 'OPT123';
  const restaurants: Restaurant[] = [
    {
      placeId: 'place-pizza',
      name: 'Pizza Palace',
      rating: 4.5,
      priceLevel: 2,
      cuisineType: 'Italian',
      address: '123 Main St',
    },
    {
      placeId: 'place-sushi',
      name: 'Sushi Spot',
      rating: 4.8,
      priceLevel: 3,
    },
  ];

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await redis.del(`session:${sessionCode}`);
    await redis.del(`session:${sessionCode}:restaurant_ids`);
    await redis.del(`session:${sessionCode}:restaurants`);
    vi.restoreAllMocks();
  });

  async function createSessionRestaurants(): Promise<void> {
    await redis.hset(`session:${sessionCode}`, {
      hostId: 'host-1',
      state: 'waiting',
      participantCount: '1',
      createdAt: '1700000000',
      lastActivityAt: '1700000000',
      hostName: 'Alice',
    });
    await redis.sadd(
      `session:${sessionCode}:restaurant_ids`,
      ...restaurants.map((restaurant) => restaurant.placeId)
    );

    const restaurantHash = Object.fromEntries(
      restaurants.map((restaurant) => [
        restaurant.placeId,
        JSON.stringify(restaurant),
      ])
    );
    await redis.hset(`session:${sessionCode}:restaurants`, restaurantHash);
  }

  it('should return session restaurants', async () => {
    await createSessionRestaurants();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.sessionCode).toBe(sessionCode);
    expect(response.body.restaurants).toHaveLength(2);
    expect(response.body.restaurants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placeId: 'place-pizza',
          name: 'Pizza Palace',
          rating: 4.5,
          priceLevel: 2,
        }),
        expect.objectContaining({
          placeId: 'place-sushi',
          name: 'Sushi Spot',
          rating: 4.8,
          priceLevel: 3,
        }),
      ])
    );
    expect(logSpy).toHaveBeenCalledWith('Fetched restaurants via REST', {
      sessionCode,
      restaurantCount: 2,
    });
  });

  it('should return 404 for invalid session code format', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app)
      .get('/api/options/bad')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Not Found',
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    });
    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode: 'bad',
      reason: 'invalid_session_code',
    });
  });

  it('should return 404 when session does not exist', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Not Found',
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    });
    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode,
      reason: 'session_not_found',
    });
  });

  it('should return 404 when a session has no restaurant ids', async () => {
    await redis.hset(`session:${sessionCode}`, {
      hostId: 'host-1',
      state: 'waiting',
      participantCount: '1',
      createdAt: '1700000000',
      lastActivityAt: '1700000000',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Not Found',
      code: 'NO_RESTAURANTS',
      message: 'No restaurants found for this session',
    });
    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode,
      reason: 'no_restaurant_ids',
    });
  });

  it('should return 404 when restaurant ids have no stored restaurant data', async () => {
    await redis.hset(`session:${sessionCode}`, {
      hostId: 'host-1',
      state: 'waiting',
      participantCount: '1',
      createdAt: '1700000000',
      lastActivityAt: '1700000000',
    });
    await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'missing-place');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Not Found',
      code: 'NO_RESTAURANTS',
      message: 'No restaurants found for this session',
    });
    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode,
      reason: 'restaurant_data_missing',
      requestedRestaurantCount: 1,
    });
  });
});

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Contract Test: API logging', () => {
  const redis = getTestRedis();
  const sessionCode = 'LOG123';
  const restaurants: Restaurant[] = [
    {
      placeId: 'place-noodle',
      name: 'Noodle House',
      rating: 4.4,
      priceLevel: 2,
    },
  ];

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
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
    await redis.hset(
      `session:${sessionCode}:restaurants`,
      Object.fromEntries(
        restaurants.map((restaurant) => [
          restaurant.placeId,
          JSON.stringify(restaurant),
        ])
      )
    );
  }

  it('logs session creation with operational context', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    expect(logSpy).toHaveBeenCalledWith('Created REST session', {
      sessionCode: response.body.sessionCode,
      hasLocation: false,
      searchRadiusMiles: null,
      restaurantCount: 0,
    });
  });

  it('logs create-session validation rejections without user input values', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app)
      .post('/api/sessions')
      .send({ hostName: '' })
      .expect(400);

    expect(warnSpy).toHaveBeenCalledWith('Rejected REST session create', {
      reason: 'validation_error',
      fields: ['hostName'],
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Alice');
  });

  it('logs missing session lookups with the requested session code', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app)
      .get('/api/sessions/ZZZ999')
      .expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected REST session get', {
      sessionCode: 'ZZZ999',
      reason: 'session_not_found',
    });
  });

  it('logs full-session join rejections with capacity context', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);
    const createdCode = createResponse.body.sessionCode;

    await request(app).post(`/api/sessions/${createdCode}/join`).send({ participantName: 'Bob' }).expect(200);
    await request(app).post(`/api/sessions/${createdCode}/join`).send({ participantName: 'Cara' }).expect(200);
    await request(app).post(`/api/sessions/${createdCode}/join`).send({ participantName: 'Dan' }).expect(200);

    await request(app)
      .post(`/api/sessions/${createdCode}/join`)
      .send({ participantName: 'Eve' })
      .expect(403);

    expect(warnSpy).toHaveBeenCalledWith('Rejected REST session join', {
      sessionCode: createdCode,
      reason: 'session_full',
      participantLimit: 4,
    });
  });

  it('logs options responses and missing restaurant data', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await createSessionRestaurants();

    await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(200);

    expect(logSpy).toHaveBeenCalledWith('Returned REST session options', {
      sessionCode,
      restaurantCount: 1,
      missingRestaurantDataCount: 0,
    });

    await redis.del(`session:${sessionCode}:restaurants`);

    await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected REST options get', {
      sessionCode,
      reason: 'restaurant_data_missing',
      requestedRestaurantCount: 1,
      missingRestaurantDataCount: 1,
    });
  });
});

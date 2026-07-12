import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { captureLogs } from '../helpers/logCapture.js';
import { sessionService as SessionService } from '../../src/services/SessionService.js';
import { DomainError } from '../../src/services/DomainError.js';
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

  async function createSessionRecord(code: string): Promise<void> {
    await redis.hset(`session:${code}`, {
      sessionCode: code,
      hostId: 'host-1',
      hostName: 'Alice',
      state: 'waiting',
      participantCount: '1',
      createdAt: Date.now().toString(),
      lastActivityAt: Date.now().toString(),
    });
  }

  async function createSessionRestaurants(): Promise<void> {
    await createSessionRecord(sessionCode);
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
    const logs = captureLogs();

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    expect(logs.withMsg('Created REST session')[0]).toMatchObject({
      sessionCode: response.body.sessionCode,
      hasLocation: false,
      searchRadiusMiles: null,
      restaurantCount: 0,
    });
  });

  it('logs create-session validation rejections without user input values', async () => {
    const logs = captureLogs();

    await request(app)
      .post('/api/sessions')
      .send({ hostName: '' })
      .expect(400);

    expect(logs.withMsg('Rejected REST session create')[0]).toMatchObject({
      reason: 'validation_error',
      fields: ['hostName'],
    });
  });

  it('logs expected no-restaurant creation failures separately from unexpected errors', async () => {
    const logs = captureLogs();
    vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(
      new DomainError('NO_RESTAURANTS_FOUND', 'No restaurants found in the specified area.')
    );

    await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: -37.8136, longitude: 144.9631 },
        searchRadiusMiles: 1,
      })
      .expect(400);

    expect(logs.withMsg('Rejected REST session create')[0]).toMatchObject({
      reason: 'no_restaurants_found',
      hasLocation: true,
      searchRadiusMiles: 1,
    });
  });

  it('logs successful session lookups with session context', async () => {
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const logs = captureLogs();
    await request(app)
      .get(`/api/sessions/${createResponse.body.sessionCode}`)
      .expect(200);

    expect(logs.withMsg('Returned REST session')[0]).toMatchObject({
      sessionCode: createResponse.body.sessionCode,
      state: 'waiting',
      participantCount: 1,
    });
  });

  it('logs missing session lookups with the requested session code', async () => {
    const logs = captureLogs();

    await request(app)
      .get('/api/sessions/ZZZ999')
      .expect(404);

    expect(logs.withMsg('Rejected REST session get')[0]).toMatchObject({
      sessionCode: 'ZZZ999',
      reason: 'session_not_found',
    });
  });

  it('logs invalid REST join session codes before returning 404', async () => {
    const logs = captureLogs();

    await request(app)
      .post('/api/sessions/bad/join')
      .send({ participantName: 'Bob' })
      .expect(404);

    expect(logs.withMsg('Rejected REST session join')[0]).toMatchObject({
      sessionCode: 'bad',
      reason: 'invalid_session_code',
    });
  });

  it('logs rejected REST joins with validation context', async () => {
    const logs = captureLogs();

    await request(app).post('/api/sessions/ABC123/join').send({}).expect(400);

    expect(logs.withMsg('Rejected REST session join')[0]).toMatchObject({
      sessionCode: 'ABC123',
      reason: 'validation_error',
      fields: ['participantName'],
    });
  });

  it('logs full-session join rejections with capacity context', async () => {
    const logs = captureLogs();
    vi.spyOn(SessionService, 'joinSession').mockRejectedValueOnce(
      new DomainError('SESSION_FULL', 'Session is full (maximum 4 participants)')
    );

    await request(app)
      .post('/api/sessions/ABC123/join')
      .send({ participantName: 'Bob' })
      .expect(403);

    expect(logs.withMsg('Rejected REST session join')[0]).toMatchObject({
      sessionCode: 'ABC123',
      reason: 'session_full',
      participantLimit: 4,
    });
  });

  it('logs successful REST joins with session context', async () => {
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const logs = captureLogs();
    const joinResponse = await request(app)
      .post(`/api/sessions/${createResponse.body.sessionCode}/join`)
      .send({ participantName: 'Bob' })
      .expect(200);

    expect(logs.withMsg('Joined REST session')[0]).toMatchObject({
      sessionCode: createResponse.body.sessionCode,
      participantId: joinResponse.body.participantId,
      participantCount: joinResponse.body.participantCount,
    });
  });

  it('logs invalid option session codes before returning 404', async () => {
    const logs = captureLogs();

    await request(app).get('/api/options/bad').expect(404);

    expect(logs.withMsg('Rejected REST options get')[0]).toMatchObject({
      sessionCode: 'bad',
      reason: 'invalid_session_code',
    });
  });

  it('logs missing option sessions before returning 404', async () => {
    const logs = captureLogs();

    await request(app).get('/api/options/ABC123').expect(404);

    expect(logs.withMsg('Rejected REST options get')[0]).toMatchObject({
      sessionCode: 'ABC123',
      reason: 'session_not_found',
    });
  });

  it('logs no-restaurant option responses with the reason', async () => {
    const logs = captureLogs();
    await createSessionRecord('ABC123');

    await request(app).get('/api/options/ABC123').expect(404);

    expect(logs.withMsg('Rejected REST options get')[0]).toMatchObject({
      sessionCode: 'ABC123',
      reason: 'restaurant_ids_missing',
    });
  });

  it('logs options responses and missing restaurant data', async () => {
    const logs = captureLogs();
    await createSessionRestaurants();

    await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(200);

    expect(logs.withMsg('Returned REST session options')[0]).toMatchObject({
      sessionCode,
      restaurantCount: 1,
      missingRestaurantDataCount: 0,
    });

    await redis.del(`session:${sessionCode}:restaurants`);

    await request(app)
      .get(`/api/options/${sessionCode}`)
      .expect(404);

    expect(logs.withMsg('Rejected REST options get')[0]).toMatchObject({
      sessionCode,
      reason: 'restaurant_data_missing',
      requestedRestaurantCount: 1,
      missingRestaurantDataCount: 1,
    });
  });
});

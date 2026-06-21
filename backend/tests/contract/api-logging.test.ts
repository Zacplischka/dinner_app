import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as SessionService from '../../src/services/SessionService.js';

describe('REST API logging coverage', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
  });

  it('logs successful session creation with session context', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    expect(logSpy).toHaveBeenCalledWith('Created session', {
      sessionCode: response.body.sessionCode,
      hostName: 'Alice',
      hasLocation: false,
      searchRadiusMiles: undefined,
      restaurantCount: 0,
    });
  });

  it('logs rejected session creation requests with validation context', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app).post('/api/sessions').send({}).expect(400);

    expect(warnSpy).toHaveBeenCalledWith('Rejected POST /api/sessions', {
      reason: 'validation_error',
      fields: ['hostName'],
    });
  });

  it('logs expected no-restaurant creation failures separately from unexpected errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(
      new Error('NO_RESTAURANTS_FOUND')
    );

    await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        location: { latitude: -37.8136, longitude: 144.9631 },
        searchRadiusMiles: 1,
      })
      .expect(400);

    expect(warnSpy).toHaveBeenCalledWith('Rejected POST /api/sessions', {
      reason: 'no_restaurants_found',
      hasLocation: true,
      searchRadiusMiles: 1,
    });
  });

  it('logs successful session lookups with session context', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);
    logSpy.mockClear();

    await request(app)
      .get(`/api/sessions/${createResponse.body.sessionCode}`)
      .expect(200);

    expect(logSpy).toHaveBeenCalledWith('Fetched session', {
      sessionCode: createResponse.body.sessionCode,
      state: 'waiting',
      participantCount: 1,
    });
  });

  it('logs missing session lookups with the rejection reason', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app).get('/api/sessions/ABC123').expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/sessions/:sessionCode', {
      sessionCode: 'ABC123',
      reason: 'session_not_found',
    });
  });

  it('logs invalid REST join session codes before returning 404', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app)
      .post('/api/sessions/bad/join')
      .send({ participantName: 'Bob' })
      .expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected POST /api/sessions/:sessionCode/join', {
      sessionCode: 'bad',
      reason: 'invalid_session_code',
    });
  });

  it('logs rejected REST joins with validation context', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app).post('/api/sessions/ABC123/join').send({}).expect(400);

    expect(warnSpy).toHaveBeenCalledWith('Rejected POST /api/sessions/:sessionCode/join', {
      sessionCode: 'ABC123',
      reason: 'validation_error',
      fields: ['participantName'],
    });
  });

  it('logs expected REST join failures separately from unexpected errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(SessionService, 'joinSession').mockRejectedValueOnce(new Error('SESSION_FULL'));

    await request(app)
      .post('/api/sessions/ABC123/join')
      .send({ participantName: 'Bob' })
      .expect(403);

    expect(warnSpy).toHaveBeenCalledWith('Rejected POST /api/sessions/:sessionCode/join', {
      sessionCode: 'ABC123',
      reason: 'session_full',
    });
  });

  it('logs successful REST joins with session context', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);
    logSpy.mockClear();

    const joinResponse = await request(app)
      .post(`/api/sessions/${createResponse.body.sessionCode}/join`)
      .send({ participantName: 'Bob' })
      .expect(200);

    expect(logSpy).toHaveBeenCalledWith('Joined session via REST', {
      sessionCode: createResponse.body.sessionCode,
      participantId: joinResponse.body.participantId,
      participantName: 'Bob',
      participantCount: joinResponse.body.participantCount,
    });
  });

  it('logs invalid option session codes before returning 404', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app).get('/api/options/bad').expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode: 'bad',
      reason: 'invalid_session_code',
    });
  });

  it('logs missing option sessions before returning 404', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await request(app).get('/api/options/ABC123').expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode: 'ABC123',
      reason: 'session_not_found',
    });
  });

  it('logs successful restaurant option fetches with result counts', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await redis.hset('session:ABC123', {
      sessionCode: 'ABC123',
      hostId: 'host',
      hostName: 'Alice',
      state: 'waiting',
      participantCount: '1',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    await redis.sadd('session:ABC123:restaurant_ids', 'place-1');
    await redis.hset(
      'session:ABC123:restaurants',
      'place-1',
      JSON.stringify({
        placeId: 'place-1',
        name: 'Test Bistro',
        rating: 4.5,
        priceLevel: 2,
        cuisine: ['Modern Australian'],
        address: '1 Test Street',
        photoUrl: 'https://example.com/photo.jpg',
        isOpenNow: true,
      })
    );

    await request(app).get('/api/options/ABC123').expect(200);

    expect(logSpy).toHaveBeenCalledWith('Fetched restaurant options', {
      sessionCode: 'ABC123',
      restaurantCount: 1,
    });
  });

  it('logs no-restaurant option responses with the reason', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await redis.hset('session:ABC123', {
      sessionCode: 'ABC123',
      hostId: 'host',
      hostName: 'Alice',
      state: 'waiting',
      participantCount: '1',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    await request(app).get('/api/options/ABC123').expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode: 'ABC123',
      reason: 'no_restaurant_ids',
    });
  });

  it('logs missing restaurant records when IDs exist but payloads are absent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await redis.hset('session:ABC123', {
      sessionCode: 'ABC123',
      hostId: 'host',
      hostName: 'Alice',
      state: 'waiting',
      participantCount: '1',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    await redis.sadd('session:ABC123:restaurant_ids', 'place-1');

    await request(app).get('/api/options/ABC123').expect(404);

    expect(warnSpy).toHaveBeenCalledWith('Rejected GET /api/options/:sessionCode', {
      sessionCode: 'ABC123',
      reason: 'restaurant_records_missing',
      requestedRestaurantCount: 1,
    });
  });
});

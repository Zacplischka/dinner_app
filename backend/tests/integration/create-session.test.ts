import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import Redis from 'ioredis';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';

describe('Integration Test: Create Session Flow (FR-001, FR-002, FR-003)', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should create session and return valid session metadata', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    expect(response.body.sessionCode).toMatch(/^[A-Z0-9]{5}$/);
    expect(response.body.shareableLink).toContain(response.body.sessionCode);
    expect(response.body.shareableLink).toMatch(/^http/);
    expect(response.body).toMatchObject({
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      restaurantCount: 0,
    });
  });

  it('should store session metadata in Redis', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const sessionCode = response.body.sessionCode;
    const sessionData = await redis.hgetall(`session:${sessionCode}`);

    expect(sessionData).toMatchObject({
      hostName: 'Alice',
      state: 'waiting',
      participantCount: '1',
    });
    expect(sessionData.hostId).toMatch(/^temp-/);
    expect(sessionData.createdAt).toBeTruthy();
    expect(sessionData.lastActivityAt).toBeTruthy();
  });

  it('should set a 30-minute TTL on the session key', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const ttl = await redis.ttl(`session:${response.body.sessionCode}`);
    expect(ttl).toBeGreaterThan(1700);
    expect(ttl).toBeLessThanOrEqual(1800);
  });

  it('should generate unique session codes for concurrent requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/sessions').send({ hostName: 'TestUser' })
      )
    );

    responses.forEach((response) => {
      expect(response.status).toBe(201);
    });

    const sessionCodes = responses.map((response) => response.body.sessionCode);
    expect(new Set(sessionCodes).size).toBe(10);
  });

  it('should return expiresAt timestamp about 30 minutes in the future', async () => {
    const beforeCreate = Date.now();

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const expiresAt = new Date(response.body.expiresAt).getTime();
    const expectedExpiry = beforeCreate + 30 * 60 * 1000;

    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
  });

  it('should preserve accepted hostName characters and length', async () => {
    const hostName = "Alice O'Brien " + 'A'.repeat(35);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName })
      .expect(201);

    expect(response.body.hostName).toBe(hostName);
  });
});

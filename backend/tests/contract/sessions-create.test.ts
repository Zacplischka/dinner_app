import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';

describe('Contract Test: POST /api/sessions', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    // Ensure Redis is connected
    await waitForRedis(redis);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData(redis);
  });

  afterAll(async () => {
    // Note: Redis connection is shared and closed at process exit
  });

  it('should return 201 with valid SessionResponse schema on successful session creation', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect('Content-Type', /json/)
      .expect(201);

    // Validate response matches OpenAPI SessionResponse schema
    expect(response.body).toHaveProperty('sessionCode');
    expect(response.body.sessionCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body).toHaveProperty('hostName', 'Alice');
    expect(response.body).toHaveProperty('participantCount', 1);
    expect(response.body).toHaveProperty('state');
    expect(['waiting', 'selecting', 'complete', 'expired']).toContain(response.body.state);
    expect(response.body).toHaveProperty('expiresAt');
    expect(new Date(response.body.expiresAt).toISOString()).toBe(response.body.expiresAt); // Valid ISO 8601
    expect(response.body).toHaveProperty('shareableLink');
    expect(response.body.shareableLink).toContain(response.body.sessionCode);
  });

  it('should return 400 with ErrorResponse schema when hostName is missing', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({})
      .expect('Content-Type', /json/)
      .expect(400);

    // Validate error response matches OpenAPI ErrorResponse schema
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('message');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when hostName is empty string', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: '' })
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when hostName exceeds 50 characters', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'A'.repeat(51) })
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should accept hostName at exactly 50 characters', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'A'.repeat(50) })
      .expect(201);

    expect(response.body.hostName).toBe('A'.repeat(50));
  });

  it('should generate unique session codes for concurrent requests', async () => {
    const requests = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/sessions')
        .send({ hostName: 'TestUser' })
    );

    const responses = await Promise.all(requests);
    const sessionCodes = responses.map(r => r.body.sessionCode);
    const uniqueCodes = new Set(sessionCodes);

    expect(uniqueCodes.size).toBe(5); // All codes should be unique
  });
});
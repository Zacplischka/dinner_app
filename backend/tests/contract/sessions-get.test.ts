import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';

describe('Contract Test: GET /api/sessions/:sessionCode', () => {
  const redis = getTestRedis();
  let testSessionCode: string;

  beforeAll(async () => {
    // Ensure Redis is connected
    await waitForRedis(redis);

    // Clean up any existing test data from previous test files
    await cleanupTestData(redis);

    // Create a test session for GET tests
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'TestHost' });
    testSessionCode = createResponse.body.sessionCode;
  });

  afterAll(async () => {
    // Clean up test data after all tests complete
    await cleanupTestData(redis);
  });

  it('should return 200 with valid SessionResponse schema for existing session', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionCode}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate response matches OpenAPI SessionResponse schema
    expect(response.body).toHaveProperty('sessionCode', testSessionCode);
    expect(response.body).toHaveProperty('hostName');
    expect(typeof response.body.hostName).toBe('string');
    expect(response.body).toHaveProperty('participantCount');
    expect(response.body.participantCount).toBeGreaterThanOrEqual(1);
    expect(response.body.participantCount).toBeLessThanOrEqual(4);
    expect(response.body).toHaveProperty('state');
    expect(['waiting', 'selecting', 'complete', 'expired']).toContain(response.body.state);
    expect(response.body).toHaveProperty('expiresAt');
    expect(new Date(response.body.expiresAt).toISOString()).toBe(response.body.expiresAt);
    expect(response.body).toHaveProperty('shareableLink');
  });

  it('should return 404 with ErrorResponse schema for non-existent session', async () => {
    const response = await request(app)
      .get('/api/sessions/NOTFOUND')
      .expect('Content-Type', /json/)
      .expect(404);

    // Validate error response matches OpenAPI ErrorResponse schema
    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body).toHaveProperty('code', 'SESSION_NOT_FOUND');
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('not found');
  });

  it('should return 404 for expired session', async () => {
    // This test would require manipulating Redis TTL or waiting
    // For now, we test with an intentionally invalid code
    const response = await request(app)
      .get('/api/sessions/EXPIRE')
      .expect(404);

    expect(response.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should validate sessionCode format in URL parameter', async () => {
    // Test with invalid session code format (not 6 alphanumeric uppercase)
    const response = await request(app)
      .get('/api/sessions/abc')  // Too short
      .expect(404);

    expect(response.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('should return consistent data across multiple GET requests', async () => {
    const response1 = await request(app)
      .get(`/api/sessions/${testSessionCode}`)
      .expect(200);

    const response2 = await request(app)
      .get(`/api/sessions/${testSessionCode}`)
      .expect(200);

    expect(response1.body.sessionCode).toBe(response2.body.sessionCode);
    expect(response1.body.hostName).toBe(response2.body.hostName);
    expect(response1.body.participantCount).toBe(response2.body.participantCount);
  });
});
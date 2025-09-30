import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';

describe('Contract Test: POST /api/sessions/:sessionCode/join', () => {
  const redis = getTestRedis();
  let testSessionCode: string;

  beforeAll(async () => {
    // Ensure Redis is connected
    await waitForRedis(redis);

    // Clean up any existing test data from previous test files
    await cleanupTestData(redis);
  });

  beforeEach(async () => {
    // Create a fresh test session for each test
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' });
    testSessionCode = createResponse.body.sessionCode;
  });

  afterEach(async () => {
    // Clean up test data
    await cleanupTestData(redis);
  });

  afterAll(async () => {
    // Clean up test data after all tests complete
    await cleanupTestData(redis);
  });

  it('should return 200 with valid JoinSessionResponse schema on successful join', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Bob' })
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate response matches OpenAPI JoinSessionResponse schema
    expect(response.body).toHaveProperty('participantId');
    expect(typeof response.body.participantId).toBe('string');
    expect(response.body).toHaveProperty('sessionCode', testSessionCode);
    expect(response.body).toHaveProperty('participantName', 'Bob');
    expect(response.body).toHaveProperty('participantCount');
    expect(response.body.participantCount).toBeGreaterThanOrEqual(2); // Host + Bob
    expect(response.body.participantCount).toBeLessThanOrEqual(4);
  });

  it('should return 400 when participantName is missing', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({})
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(response.body).toHaveProperty('message');
  });

  it('should return 400 when participantName is empty string', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: '' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when participantName exceeds 50 characters', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'B'.repeat(51) })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 403 with SESSION_FULL error when session has 4 participants', async () => {
    // Join with 3 more participants to reach limit of 4
    await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Bob' })
      .expect(200);

    await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Charlie' })
      .expect(200);

    await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Diana' })
      .expect(200);

    // 5th participant should be rejected
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Eve' })
      .expect('Content-Type', /json/)
      .expect(403);

    expect(response.body).toHaveProperty('error', 'Session is full');
    expect(response.body).toHaveProperty('code', 'SESSION_FULL');
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('4 participants');
  });

  it('should return 404 when session does not exist', async () => {
    const response = await request(app)
      .post('/api/sessions/NOTEXIST/join')
      .send({ participantName: 'Bob' })
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body).toHaveProperty('code', 'SESSION_NOT_FOUND');
    expect(response.body).toHaveProperty('message');
  });

  it('should increment participantCount with each successful join', async () => {
    const response1 = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Bob' })
      .expect(200);

    expect(response1.body.participantCount).toBe(2); // Alice + Bob

    const response2 = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: 'Charlie' })
      .expect(200);

    expect(response2.body.participantCount).toBe(3); // Alice + Bob + Charlie
  });

  it('should accept participantName at exactly 50 characters', async () => {
    const longName = 'B'.repeat(50);
    const response = await request(app)
      .post(`/api/sessions/${testSessionCode}/join`)
      .send({ participantName: longName })
      .expect(200);

    expect(response.body.participantName).toBe(longName);
  });
});
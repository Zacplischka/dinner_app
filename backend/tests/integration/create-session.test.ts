import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import Redis from 'ioredis';

describe('Integration Test: Create Session Flow (FR-001, FR-002, FR-003)', () => {
  let app: Express;
  let redis: Redis;

  beforeAll(async () => {
    // TODO: Import app and redis client once implemented
    throw new Error('Server not implemented yet - this test should fail');

    // TODO: Initialize Redis connection
    // redis = new Redis({
    //   host: 'localhost',
    //   port: 6379,
    // });
  });

  afterAll(async () => {
    // TODO: Clean up Redis and close connections
    // await redis.quit();
  });

  it('should create session and return valid session code and shareable link', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    // FR-001: Generate unique session code
    expect(response.body.sessionCode).toMatch(/^[A-Z0-9]{6}$/);

    // FR-002: Return shareable link
    expect(response.body.shareableLink).toContain(response.body.sessionCode);
    expect(response.body.shareableLink).toMatch(/^http/);

    // FR-003: Host becomes first participant
    expect(response.body.participantCount).toBe(1);
    expect(response.body.hostName).toBe('Alice');
  });

  it('should store session in Redis with correct structure', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const sessionCode = response.body.sessionCode;

    // Check session hash exists in Redis
    const sessionExists = await redis.exists(`session:${sessionCode}`);
    expect(sessionExists).toBe(1);

    // Verify session metadata
    const sessionData = await redis.hgetall(`session:${sessionCode}`);
    expect(sessionData.hostId).toBeTruthy();
    expect(sessionData.state).toBe('waiting');
    expect(sessionData.participantCount).toBe('1');
    expect(sessionData.createdAt).toBeTruthy();
    expect(sessionData.lastActivityAt).toBeTruthy();
  });

  it('should set 30-minute TTL on session and related keys (FR-019)', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const sessionCode = response.body.sessionCode;

    // Check TTL on session key
    const ttl = await redis.ttl(`session:${sessionCode}`);
    expect(ttl).toBeGreaterThan(1700); // ~30 minutes = 1800 seconds, allow some margin
    expect(ttl).toBeLessThanOrEqual(1800);

    // Check TTL on participants set
    const participantsTTL = await redis.ttl(`session:${sessionCode}:participants`);
    expect(participantsTTL).toBeGreaterThan(1700);
    expect(participantsTTL).toBeLessThanOrEqual(1800);
  });

  it('should add host to participants set', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const sessionCode = response.body.sessionCode;

    // Verify host is in participants set
    const participantCount = await redis.scard(`session:${sessionCode}:participants`);
    expect(participantCount).toBe(1);

    const participants = await redis.smembers(`session:${sessionCode}:participants`);
    expect(participants.length).toBe(1);
  });

  it('should generate unique session codes for concurrent requests', async () => {
    const requests = Array.from({ length: 10 }, () =>
      request(app).post('/api/sessions').send({ hostName: 'TestUser' })
    );

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(201);
    });

    // All codes should be unique
    const sessionCodes = responses.map((r) => r.body.sessionCode);
    const uniqueCodes = new Set(sessionCodes);
    expect(uniqueCodes.size).toBe(10);
  });

  it('should return expiresAt timestamp 30 minutes in future', async () => {
    const beforeCreate = new Date();

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const afterCreate = new Date();
    const expiresAt = new Date(response.body.expiresAt);

    // expiresAt should be ~30 minutes from now
    const expectedExpiry = new Date(beforeCreate.getTime() + 30 * 60 * 1000);
    const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiry.getTime());

    expect(timeDiff).toBeLessThan(5000); // Within 5 seconds tolerance
  });

  it('should initialize session in waiting state', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    expect(response.body.state).toBe('waiting');
  });

  it('should create participant metadata hash for host', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);

    const sessionCode = response.body.sessionCode;
    const participants = await redis.smembers(`session:${sessionCode}:participants`);
    const hostId = participants[0];

    // Check host participant metadata
    const hostData = await redis.hgetall(`participant:${hostId}`);
    expect(hostData.displayName).toBe('Alice');
    expect(hostData.sessionCode).toBe(sessionCode);
    expect(hostData.isHost).toBe('true');
    expect(hostData.joinedAt).toBeTruthy();
  });

  it('should handle special characters in hostName', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: "Alice O'Brien" })
      .expect(201);

    expect(response.body.hostName).toBe("Alice O'Brien");
  });

  it('should accept maximum length hostName (50 characters)', async () => {
    const longName = 'A'.repeat(50);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: longName })
      .expect(201);

    expect(response.body.hostName).toBe(longName);
  });
});
// Contract Test: POST /api/sessions in the Watch Branch (#369). The create
// opens a Watch lobby; each Participant's Mood is collected there and the
// host's start deals (session-lobby.test.ts drives that over the wire).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';

const mood = { genres: ['Comedy'], decades: [] };

describe('Contract Test: POST /api/sessions (Watch Branch)', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('accepts a pre-lobby Mood and ignores it: the lobby deals nothing yet', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood })
      .expect(201);

    expect(response.body).toMatchObject({ branch: 'watch', state: 'waiting' });
    // Cook's setup echo is Cook's alone.
    expect(response.body).not.toHaveProperty('headcount');
    await expect(redis.hget(`session:${response.body.sessionCode}`, 'mood')).resolves.toBeNull();
  });

  it('rejects a genre or media type outside the offered vocabulary', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood: { ...mood, genres: ['Reality'] } })
      .expect(400);
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood: { ...mood, mediaTypes: ['podcast'] } })
      .expect(400);
  });
});

// Contract Test: POST /api/sessions in the Watch Branch (#369).
// Drives the real app over HTTP. Nothing is faked at a boundary because there
// is none: the Movie supply is the committed corpus, read in memory, so what a
// Mood can deal is a fact about the repository and deterministic run to run.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis, testKeys } from '../helpers/testSetup.js';

const mood = { genres: ['Comedy'], decades: [] };

describe('Contract Test: POST /api/sessions (Watch Branch)', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('deals a Movie Deck', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood })
      .expect(201);

    expect(response.body).toMatchObject({ branch: 'watch', restaurantCount: 15 });
    // Cook's setup echo is Cook's alone.
    expect(response.body).not.toHaveProperty('headcount');
  });

  it('deals Movies through the card union — title, poster and facts, kind movie', async () => {
    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood })
      .expect(201);

    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);

    expect(options.restaurants).toHaveLength(15);
    for (const card of options.restaurants) {
      expect(card).toMatchObject({
        kind: 'movie',
        placeId: expect.stringMatching(/^Q\d+$/),
        name: expect.any(String),
        photoUrl: expect.any(String),
        year: expect.any(Number),
        genres: expect.arrayContaining(['Comedy']),
      });
    }
  });

  // Zero is the Watch Branch's one refusal, and like Cook's it lives at setup:
  // the Host relaxes their own chips, the app never relaxes them for anyone.
  it('refuses a Mood the corpus has no Movie for, and creates no Session', async () => {
    const response = await request(app)
      .post('/api/sessions')
      // Both chips are offered; the corpus simply holds no 1970s documentary.
      .send({
        hostName: 'Alice',
        branch: 'watch',
        mood: { genres: ['Documentary'], decades: ['1970s'] },
      })
      .expect(404);

    expect(response.body).toMatchObject({ code: 'NO_MOVIES_FOUND' });
    expect(response.body.message).toMatch(/no movies/i);
    await expect(testKeys(redis, 'session:*')).resolves.toEqual([]);
  });

  it('rejects a Watch Session with no Mood', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch' })
      .expect(400);
  });

  it('rejects a genre outside the offered vocabulary', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood: { ...mood, genres: ['Western'] } })
      .expect(400);
  });

  it('leaves an Eat Out Session on the restaurant path, Mood ignored', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'eatout', mood })
      .expect(201);

    expect(response.body.restaurantCount).toBe(0);
    await expect(redis.hget(`session:${response.body.sessionCode}`, 'mood')).resolves.toBeNull();
  });
});

// Contract Test: POST /api/sessions in the Watch Branch (#369).
// Drives the real app over HTTP. Nothing is faked at a boundary because there
// is none: the Movie supply is a committed corpus, read in memory — here the
// 24-title fixture MOVIES_FILE points at (vitest.workspace.ts), so what a
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

  it('deals the Deck size the Host chose, and the same again on Restart (#415)', async () => {
    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood, deckSize: 8 })
      .expect(201);

    expect(session.restaurantCount).toBe(8);

    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);
    expect(options.restaurants).toHaveLength(8);
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
        placeId: expect.stringMatching(/^tmdb:(movie|tv):\d+$/),
        mediaType: expect.stringMatching(/^(movie|tv)$/),
        name: expect.any(String),
        photoUrl: expect.any(String),
        year: expect.any(Number),
        genres: expect.arrayContaining(['Comedy']),
      });
    }
  });

  it('deals only series when the Mood asks for them', async () => {
    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'watch', mood: { ...mood, mediaTypes: ['tv'] } })
      .expect(201);

    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);

    expect(options.restaurants.length).toBeGreaterThan(0);
    for (const card of options.restaurants) {
      expect(card).toMatchObject({
        placeId: expect.stringMatching(/^tmdb:tv:\d+$/),
        mediaType: 'tv',
        seasons: expect.any(Number),
      });
    }
  });

  // Zero is the Watch Branch's one refusal, and like Cook's it lives at setup:
  // the Host relaxes their own chips, the app never relaxes them for anyone.
  it('refuses a Mood the corpus has no Movie for, and creates no Session', async () => {
    const response = await request(app)
      .post('/api/sessions')
      // The chip is offered; the fixture corpus simply holds no documentary.
      .send({
        hostName: 'Alice',
        branch: 'watch',
        mood: { genres: ['Documentary'], decades: [] },
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

  it('leaves an Eat Out Session on the restaurant path, Mood ignored', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'eatout', mood })
      .expect(201);

    expect(response.body.restaurantCount).toBe(0);
    await expect(redis.hget(`session:${response.body.sessionCode}`, 'mood')).resolves.toBeNull();
  });
});

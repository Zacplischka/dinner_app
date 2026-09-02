// Contract Test: GET /api/cravings/nearest (#334) — the setup screen's second
// question, asked only once a Craving has already dealt nothing. Drives the
// real app over HTTP; the corpus is the three italian vegetarian mains
// `OWNED_RECIPES_DIR` points at, so the counts below are about the ladder, not
// about the seed that ships this week.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, waitForRedis, testKeys } from '../helpers/testSetup.js';

describe('Contract Test: GET /api/cravings/nearest', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    // Pools outlive a Session and price the offer, so a warm one from an
    // earlier test would answer for this one. Start every test cold.
    const pooled = await testKeys(redis, 'recipes:*');
    if (pooled.length > 0) await redis.del(...pooled);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers the closest step that deals, and spends no vendor call doing it', async () => {
    // Any call out at all is the failure this endpoint exists to avoid.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await request(app)
      .get('/api/cravings/nearest')
      .query({ mealType: 'main course', cuisines: 'korean', diets: 'vegetarian' })
      .expect(200);

    // The corpus is italian, so widening korean to Asian answers nothing and
    // the ladder climbs to its last rung — with the diet still on it.
    expect(response.body).toEqual({
      nearest: {
        craving: { mealType: 'main course', cuisines: [], diets: ['vegetarian'] },
        label: 'any cuisine',
        recipeCount: 3,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers nothing when even the widest step is empty', async () => {
    const response = await request(app)
      .get('/api/cravings/nearest')
      .query({ mealType: 'main course', cuisines: 'korean', diets: 'vegan' })
      .expect(200);

    expect(response.body).toEqual({ nearest: null });
  });

  it('reads a chipless Craving as no chips, not as a bad request', async () => {
    const response = await request(app)
      .get('/api/cravings/nearest')
      .query({ mealType: 'main course' })
      .expect(200);

    // Nothing left to relax but cuisine, and there is no cuisine chip to widen.
    expect(response.body).toEqual({ nearest: null });
  });

  it('refuses a value the setup screen never offers, in the canonical shape', async () => {
    const response = await request(app)
      .get('/api/cravings/nearest')
      .query({ mealType: 'main course', cuisines: 'martian' })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    });
  });
});

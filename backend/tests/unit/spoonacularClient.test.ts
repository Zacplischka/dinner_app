// Spoonacular client unit tests over the fetch fake — the boundary and
// nothing else.
import RedisMock from 'ioredis-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpoonacularClient,
  guardDailyPoints,
  pointsKey,
} from '../../src/services/spoonacularClient.js';
import { captureLogs } from '../helpers/logCapture.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const chicken = { 'chicken breast': { id: 5062, consistency: 'solid' as const } };

describe('createSpoonacularClient', () => {
  it('converts one source unit to grams, carrying the pinned browser UA and key', async () => {
    const { fetchImpl, requests } = spoonacularFetchFake({
      gramsPerUnit: { 'chicken breast:piece': 226 },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.gramsPerUnit('chicken breast', 'piece')).resolves.toBe(226);
    expect(requests[0].url.searchParams.get('apiKey')).toBe('test-key');
    // Cloudflare 403s non-browser UAs (#244); the client must look like one.
    expect(requests[0].headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
  });

  it('answers null when Convert returns no number', async () => {
    const { fetchImpl } = spoonacularFetchFake({});
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('mystery', 'piece')).resolves.toBeNull();
  });

  it('reports a searchable ingredient with its consistency', async () => {
    const { fetchImpl } = spoonacularFetchFake({
      ingredients: { ...chicken, 'chicken stock': { id: 6172, consistency: 'liquid' } },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.ingredientInfo('chicken stock')).resolves.toEqual({
      known: true,
      consistency: 'liquid',
    });
    await expect(client.ingredientInfo('japanese curry roux')).resolves.toEqual({
      known: false,
      consistency: null,
    });
  });

  it('throws on an HTTP error so the ladder can fall through', async () => {
    const { fetchImpl } = spoonacularFetchFake({ failWith: 500 });
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('chicken breast', 'piece')).rejects.toThrow('500');
    await expect(client.ingredientInfo('chicken breast')).rejects.toThrow('500');
  });

  describe('searchRecipes', () => {
    const craving = {
      mealType: 'main course' as const,
      cuisines: ['italian' as const, 'thai' as const],
      diets: ['vegetarian' as const],
    };

    it('asks for a pool the Craving filters, with instructions required', async () => {
      const { fetchImpl, requests } = spoonacularFetchFake({ recipes: recipeHits(60) });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await client.searchRecipes(craving, { number: 60, offset: 120 });

      const params = requests[0].url.searchParams;
      expect(requests[0].url.pathname).toBe('/recipes/complexSearch');
      expect(params.get('type')).toBe('main course');
      // Spoonacular ORs a comma-separated cuisine list and ANDs the diets.
      expect(params.get('cuisine')).toBe('italian,thai');
      expect(params.get('diet')).toBe('vegetarian');
      // Every pooled Recipe must be cookable: no instructions, no Shopping List.
      expect(params.get('instructionsRequired')).toBe('true');
      expect(params.get('number')).toBe('60');
      expect(params.get('offset')).toBe('120');
    });

    it('omits the chip params a Craving leaves empty', async () => {
      const { fetchImpl, requests } = spoonacularFetchFake({ recipes: recipeHits(2) });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await client.searchRecipes(
        { mealType: 'dessert', cuisines: [], diets: [] },
        { number: 60, offset: 0 }
      );

      expect(requests[0].url.searchParams.has('cuisine')).toBe(false);
      expect(requests[0].url.searchParams.has('diet')).toBe(false);
    });

    it('maps a hit into the pooled Recipe, ingredients and steps aboard', async () => {
      const { fetchImpl } = spoonacularFetchFake({
        recipes: [
          {
            id: 716429,
            title: 'Pasta with Garlic',
            image: 'https://img.spoonacular.com/716429.jpg',
            aggregateLikes: 209,
            servings: 2,
            sourceUrl: 'https://example.test/pasta',
            sourceName: 'Full Belly Sisters',
            extendedIngredients: [
              { name: 'garlic', amount: 2, unit: 'cloves', original: '2 cloves garlic' },
            ],
            analyzedInstructions: [
              { steps: [{ step: 'Boil the pasta.' }, { step: 'Fry garlic.' }] },
            ],
          },
        ],
      });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await expect(client.searchRecipes(craving, { number: 60, offset: 0 })).resolves.toEqual([
        {
          kind: 'recipe',
          placeId: '716429',
          name: 'Pasta with Garlic',
          photoUrl: 'https://img.spoonacular.com/716429.jpg',
          aggregateLikes: 209,
          // Pooled for the mint (#262): servings is the scale's denominator,
          // and the credit is snapshotted with the steps because the list
          // outlives the pool it was read from.
          servings: 2,
          sourceName: 'Full Belly Sisters',
          sourceUrl: 'https://example.test/pasta',
          ingredients: [{ name: 'garlic', amount: 2, unit: 'cloves', original: '2 cloves garlic' }],
          steps: ['Boil the pasta.', 'Fry garlic.'],
        },
      ]);
    });

    it('drops a hit with no usable id or title rather than pooling a blank card', async () => {
      const { fetchImpl } = spoonacularFetchFake({
        recipes: [
          { id: 1, title: 'Real Dish' },
          { id: 2, title: '' },
        ],
      });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      const pooled = await client.searchRecipes(craving, { number: 60, offset: 0 });
      expect(pooled.map((recipe) => recipe.placeId)).toEqual(['1']);
      // A Recipe the source knows nothing more about is still cookable-shaped.
      expect(pooled[0]).toMatchObject({ ingredients: [], steps: [] });
    });
  });
});

// The daily-points guard (#261). Spoonacular's quota failure is inverted: past
// the tier's included points it keeps answering and bills silently, so the app
// is the only thing that can stop.
describe('guardDailyPoints', () => {
  const craving = { mealType: 'main course' as const, cuisines: [], diets: [] };
  const CEILING = 1400;
  // Under the faked clock below, today's counter key.
  const key = 'spoonacular:points:2026-08-01';

  const guarded = (redis: InstanceType<typeof RedisMock>, quotaUsed?: number | (() => number)) => {
    const { fetchImpl, requests } = spoonacularFetchFake({
      recipes: recipeHits(2),
      gramsPerUnit: { 'chicken breast:piece': 226 },
      quotaUsed,
    });
    return {
      requests,
      client: createSpoonacularClient(guardDailyPoints(redis, fetchImpl, CEILING), 'test-key'),
    };
  };

  beforeEach(async () => {
    await new RedisMock().flushall();
    // Only Date is faked: ioredis-mock's own expiry runs on real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-01T09:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counts every response, search and Convert alike', async () => {
    const redis = new RedisMock();
    let used = 0;
    const { client } = guarded(redis, () => (used += 10));

    await client.searchRecipes(craving, { number: 2, offset: 0 });
    expect(await redis.get(key)).toBe('10');

    await client.gramsPerUnit('chicken breast', 'piece');
    expect(await redis.get(key)).toBe('20');
  });

  it('makes no outbound call at or past the ceiling', async () => {
    const redis = new RedisMock();
    await redis.set(key, String(CEILING));
    const { client, requests } = guarded(redis, CEILING);

    await expect(client.searchRecipes(craving, { number: 2, offset: 0 })).rejects.toThrow(
      /ceiling/
    );
    await expect(client.gramsPerUnit('chicken breast', 'piece')).rejects.toThrow(/ceiling/);
    await expect(client.ingredientInfo('chicken breast')).rejects.toThrow(/ceiling/);
    expect(requests).toEqual([]);
  });

  it('starts over when the quota day rolls over at midnight UTC', async () => {
    const redis = new RedisMock();
    await redis.set(key, String(CEILING));
    const { client, requests } = guarded(redis, 12);

    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));

    expect(pointsKey()).toBe('spoonacular:points:2026-08-02');
    await expect(client.gramsPerUnit('chicken breast', 'piece')).resolves.toBe(226);
    expect(requests).toHaveLength(1);
    expect(await redis.get(pointsKey())).toBe('12');
    // Yesterday's count is left alone — it is a different quota day.
    expect(await redis.get(key)).toBe(String(CEILING));
  });

  it('counts a point for a response the source did not count, rather than freezing', async () => {
    const logs = captureLogs();
    const redis = new RedisMock();
    await redis.set(key, '5');
    const { client } = guarded(redis);

    // A header that stops arriving must not stop the guard: the count still
    // climbs, so a day of them still reaches the ceiling instead of billing on.
    await client.gramsPerUnit('chicken breast', 'piece');
    expect(await redis.get(key)).toBe('6');

    const warned = logs.withMsg('Spoonacular response carried no quota header');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ used: 5, path: '/recipes/convert' });
    // The path only — the query string carries the API key.
    expect(JSON.stringify(warned[0])).not.toContain('test-key');
  });
});

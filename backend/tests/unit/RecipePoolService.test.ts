// RecipePoolService unit tests — the real Spoonacular client over a fetch fake
// and ioredis-mock; only the boundaries are faked (#259 pool-and-deal).
import RedisMock from 'ioredis-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Craving } from '@dinder/shared/types';
import { createRecipePoolService, cravingPoolKey } from '../../src/services/RecipePoolService.js';
import { createSpoonacularClient } from '../../src/services/spoonacularClient.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const HOUR_MS = 3_600_000;

const pasta: Craving = {
  mealType: 'main course',
  cuisines: ['italian'],
  diets: ['vegetarian'],
};

function service(
  hits = recipeHits(60),
  overrides: {
    redis?: InstanceType<typeof RedisMock>;
    poolTtlMs?: number;
    emptyPoolTtlMs?: number;
    failWith?: number;
  } = {}
) {
  const redis = overrides.redis ?? new RedisMock();
  const { fetchImpl, requests } = spoonacularFetchFake({
    recipes: hits,
    failWith: overrides.failWith,
  });
  const created = createRecipePoolService({
    redis,
    client: createSpoonacularClient(fetchImpl, 'test-key'),
    poolTtlMs: overrides.poolTtlMs ?? 24 * HOUR_MS,
    emptyPoolTtlMs: overrides.emptyPoolTtlMs ?? HOUR_MS,
    poolSize: 60,
    deckSize: 15,
    // Deterministic deal: no shuffle, so assertions are about the cut, not luck.
    shuffle: (entries) => entries,
  });
  const searches = () => requests.filter((r) => r.url.pathname === '/recipes/complexSearch');
  return { redis, service: created, searches };
}

describe('cravingPoolKey', () => {
  it('is the same key however the chips were ordered or cased', () => {
    expect(
      cravingPoolKey({
        mealType: 'main course',
        cuisines: ['thai', 'italian'],
        diets: ['vegan', 'gluten free'],
      })
    ).toBe(
      cravingPoolKey({
        mealType: 'main course',
        cuisines: ['italian', 'thai'],
        diets: ['gluten free', 'vegan'],
      })
    );
  });

  it('separates Cravings that differ in any one criterion', () => {
    const keys = new Set([
      cravingPoolKey(pasta),
      cravingPoolKey({ ...pasta, mealType: 'dessert' }),
      cravingPoolKey({ ...pasta, cuisines: ['thai'] }),
      cravingPoolKey({ ...pasta, diets: [] }),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe('createRecipePoolService', () => {
  // ioredis-mock shares one keyspace across instances in a process, so a pool
  // written by one test is visible to the next. Start every test cold.
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('deals a Deck of deckSize Recipes from a freshly fetched pool', async () => {
    const { service: pool, searches } = service();

    const deck = await pool.dealDeck(pasta);

    expect(deck).toHaveLength(15);
    expect(searches()).toHaveLength(1);
    expect(searches()[0].url.searchParams.get('number')).toBe('60');
  });

  it('deals the Deck Entry alone — ingredients and steps stay in the pool', async () => {
    const { service: pool } = service();

    const [card] = await pool.dealDeck(pasta);

    expect(card).toEqual({
      kind: 'recipe',
      placeId: '1',
      name: 'Recipe 1',
      photoUrl: 'https://img.spoonacular.com/1.jpg',
      aggregateLikes: 0,
    });
  });

  it('serves a second Session the same warm pool without a second lookup', async () => {
    const redis = new RedisMock();
    const first = service(recipeHits(60), { redis });
    await first.service.dealDeck(pasta);

    // A different Session, its own service instance, the same Craving.
    const second = service(recipeHits(60), { redis });
    const deck = await second.service.dealDeck(pasta);

    expect(deck).toHaveLength(15);
    expect(second.searches()).toHaveLength(0);
  });

  it('fetches again for a Craving whose chips differ', async () => {
    const redis = new RedisMock();
    const { service: pool, searches } = service(recipeHits(60), { redis });

    await pool.dealDeck(pasta);
    await pool.dealDeck({ ...pasta, cuisines: ['thai'] });

    expect(searches()).toHaveLength(2);
  });

  it('expires the pool on the configured TTL', async () => {
    const { redis, service: pool } = service(recipeHits(60), { poolTtlMs: HOUR_MS });

    await pool.dealDeck(pasta);

    const ttl = await redis.pttl(cravingPoolKey(pasta));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(HOUR_MS);
  });

  it('keeps the offset counter alive longer than the pool it rotates', async () => {
    // The counter is what makes the next refresh ask for a different page. If
    // it expires first — as it did when both carried the same TTL — every
    // refresh silently re-requests offset 0 and the rotation never happens.
    const { redis, service: pool } = service(recipeHits(60), { poolTtlMs: HOUR_MS });

    await pool.dealDeck(pasta);

    const poolTtl = await redis.pttl(cravingPoolKey(pasta));
    const counterTtl = await redis.pttl(cravingPoolKey(pasta).replace('pool', 'offset'));
    expect(counterTtl).toBeGreaterThan(poolTtl);
  });

  it('rotates the source offset per refresh so a re-pooled Craving sees new dishes', async () => {
    const redis = new RedisMock();
    const { service: pool, searches } = service(recipeHits(200), { redis });

    await pool.dealDeck(pasta);
    await redis.del(cravingPoolKey(pasta)); // the pool aged out
    await pool.dealDeck(pasta);

    expect(searches().map((r) => r.url.searchParams.get('offset'))).toEqual(['0', '60']);
  });

  it('deals the whole pool when it is thinner than a Deck', async () => {
    const { service: pool } = service(recipeHits(4));

    await expect(pool.dealDeck(pasta)).resolves.toHaveLength(4);
  });

  it('deals nothing for a Craving the catalogue has no answer to', async () => {
    const { service: pool } = service(recipeHits(0));

    await expect(pool.dealDeck(pasta)).resolves.toEqual([]);
  });

  it('caches the clean miss briefly, so fiddling with chips costs one lookup', async () => {
    const redis = new RedisMock();
    const { service: pool, searches } = service(recipeHits(0), {
      redis,
      poolTtlMs: 24 * HOUR_MS,
      emptyPoolTtlMs: HOUR_MS,
    });

    await pool.dealDeck(pasta);
    await pool.dealDeck(pasta);

    expect(searches()).toHaveLength(1);
    // The miss must not squat on the Craving for the full pool TTL: the
    // catalogue may know the dish by tonight.
    const ttl = await redis.pttl(cravingPoolKey(pasta));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(HOUR_MS);
  });

  it('asks from the top when the rotation pages off the end of a small Craving', async () => {
    // 40 Recipes exist, but the second refresh asks for offset 60 and gets
    // nothing. Caching that would refuse a Craving that plainly has Recipes.
    const redis = new RedisMock();
    const { service: pool, searches } = service(recipeHits(40), { redis });
    await pool.dealDeck(pasta);
    await redis.del(cravingPoolKey(pasta));

    const deck = await pool.dealDeck(pasta);

    expect(deck).toHaveLength(15);
    expect(searches().map((r) => r.url.searchParams.get('offset'))).toEqual(['0', '60', '0']);
  });

  it('caches nothing when the source fails — a failure is not a clean miss', async () => {
    const { redis, service: pool } = service(recipeHits(60), { failWith: 503 });

    await expect(pool.dealDeck(pasta)).rejects.toThrow();

    await expect(redis.exists(cravingPoolKey(pasta))).resolves.toBe(0);
  });

  it('deals a different cut to each Session drawing on one pool', async () => {
    const redis = new RedisMock();
    const { fetchImpl } = spoonacularFetchFake({ recipes: recipeHits(60) });
    const pool = createRecipePoolService({
      redis,
      client: createSpoonacularClient(fetchImpl, 'test-key'),
      poolTtlMs: HOUR_MS,
      poolSize: 60,
      deckSize: 15,
    });

    const first = await pool.dealDeck(pasta);
    const second = await pool.dealDeck(pasta);

    expect(first.map((r) => r.placeId)).not.toEqual(second.map((r) => r.placeId));
  });
});

describe('redeal — the Restart deal (#260)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  const key = cravingPoolKey(pasta);

  it('avoids the just-wiped deal when the pool can afford it', async () => {
    const { service: pool } = service(recipeHits(60));
    const wiped = await pool.dealDeck(pasta);

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    expect(next.filter((entry) => wipedIds.has(entry.placeId))).toEqual([]);
  });

  it('tops up with repeats rather than dealing short from a thin pool', async () => {
    // 20 pooled, 15 wiped: only 5 are fresh, so 10 must come back around.
    const { service: pool } = service(recipeHits(20));
    const wiped = await pool.dealDeck(pasta);

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    // Fresh first: the five the last deal missed lead the new one.
    expect(next.slice(0, 5).some((entry) => wipedIds.has(entry.placeId))).toBe(false);
  });

  it('reshuffles the wiped deal when the pool has aged out — never an error', async () => {
    const { redis, service: pool } = service(recipeHits(60));
    const wiped = await pool.dealDeck(pasta);
    await redis.del(key);

    const next = await pool.redeal(key, wiped);

    expect(next.map((entry) => entry.placeId).sort()).toEqual(
      wiped.map((entry) => entry.placeId).sort()
    );
  });

  it('pays no lookup for a Restart — a cold pool degrades, it does not refetch', async () => {
    const { redis, service: pool, searches } = service(recipeHits(60));
    const wiped = await pool.dealDeck(pasta);
    await redis.del(key);

    await pool.redeal(key, wiped);

    expect(searches()).toHaveLength(1);
  });

  it('deals the whole thin pool rather than refusing to Restart', async () => {
    const { service: pool } = service(recipeHits(7));
    const wiped = await pool.dealDeck(pasta);

    await expect(pool.redeal(key, wiped)).resolves.toHaveLength(7);
  });
});

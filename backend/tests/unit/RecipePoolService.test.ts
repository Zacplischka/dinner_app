// RecipePoolService unit tests — the real Spoonacular client over a fetch fake
// and ioredis-mock; only the boundaries are faked (#259 pool-and-deal).
import RedisMock from 'ioredis-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Craving } from '@dinder/shared/types';
import {
  blendDeck,
  createRecipePoolService,
  cravingFromPoolKey,
  cravingPoolKey,
  cutDeck,
} from '../../src/services/RecipePoolService.js';
import { createOwnedRecipeStore, type OwnedRecipe } from '../../src/services/ownedRecipeStore.js';
import type { PooledRecipe } from '../../src/services/spoonacularClient.js';
import {
  createSpoonacularClient,
  guardDailyPoints,
  pointsKey,
} from '../../src/services/spoonacularClient.js';
import { ownedRecipes } from '../helpers/ownedCorpusFake.js';
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
    /** Set to put the #261 points guard between the client and the fake. */
    pointCeiling?: number;
    /** The Owned Recipe Store's corpus — empty unless a test blends (#331). */
    owned?: OwnedRecipe[];
    ownedFloor?: number;
    /** Shortened when a test needs the vendor-dark latch to actually expire. */
    vendorDarkTtlMs?: number;
    /** Deterministic by default: no shuffle, so assertions are about the cut. */
    shuffle?: <T>(entries: T[]) => T[];
  } = {}
) {
  const redis = overrides.redis ?? new RedisMock();
  const { fetchImpl, requests } = spoonacularFetchFake({
    recipes: hits,
    failWith: overrides.failWith,
  });
  const guarded =
    overrides.pointCeiling === undefined
      ? fetchImpl
      : guardDailyPoints(redis, fetchImpl, overrides.pointCeiling);
  const created = createRecipePoolService({
    redis,
    client: createSpoonacularClient(guarded, 'test-key'),
    owned: createOwnedRecipeStore(overrides.owned ?? []),
    poolTtlMs: overrides.poolTtlMs ?? 24 * HOUR_MS,
    emptyPoolTtlMs: overrides.emptyPoolTtlMs ?? HOUR_MS,
    poolSize: 60,
    deckSize: 15,
    ownedFloor: overrides.ownedFloor ?? 3,
    vendorDarkTtlMs: overrides.vendorDarkTtlMs,
    // Deterministic deal: no shuffle, so assertions are about the cut, not luck.
    shuffle: overrides.shuffle ?? ((entries) => entries),
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

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(searches()).toHaveLength(1);
    expect(searches()[0].url.searchParams.get('number')).toBe('60');
  });

  it('deals the Deck Entry alone — ingredients and steps stay in the pool', async () => {
    const { service: pool } = service();

    const [card] = (await pool.dealDeck(pasta)).entries;

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
    const deck = (await second.service.dealDeck(pasta)).entries;

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

    expect((await pool.dealDeck(pasta)).entries).toHaveLength(4);
  });

  it('deals nothing for a Craving the catalogue has no answer to', async () => {
    const { service: pool } = service(recipeHits(0));

    expect((await pool.dealDeck(pasta)).entries).toEqual([]);
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

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(searches().map((r) => r.url.searchParams.get('offset'))).toEqual(['0', '60', '0']);
  });

  it('caches nothing when the source fails — a failure is not a clean miss', async () => {
    const { redis, service: pool } = service(recipeHits(60), { failWith: 503 });

    await expect(pool.dealDeck(pasta)).rejects.toThrow();

    await expect(redis.exists(cravingPoolKey(pasta))).resolves.toBe(0);
  });

  it('fails the cold deal closed once the points guard has tripped (#261)', async () => {
    const redis = new RedisMock();
    await redis.set(pointsKey(), '1400');
    const { service: pool, searches } = service(recipeHits(60), { redis, pointCeiling: 1400 });

    // Exactly a source failure: it throws, so setup says the source is
    // unavailable, and — the point of the guard — nothing went out.
    await expect(pool.dealDeck(pasta)).rejects.toThrow(/ceiling/);
    expect(searches()).toHaveLength(0);
    await expect(redis.exists(cravingPoolKey(pasta))).resolves.toBe(0);
  });

  it('deals a warm pool as usual while the points guard is tripped (#261)', async () => {
    const redis = new RedisMock();
    await service(recipeHits(60), { redis }).service.dealDeck(pasta);
    await redis.set(pointsKey(), '1400');

    const dark = service(recipeHits(60), { redis, pointCeiling: 1400 });

    expect((await dark.service.dealDeck(pasta)).entries).toHaveLength(15);
    expect(dark.searches()).toHaveLength(0);
  });

  it('deals a different cut to each Session drawing on one pool', async () => {
    const redis = new RedisMock();
    const { fetchImpl } = spoonacularFetchFake({ recipes: recipeHits(60) });
    const pool = createRecipePoolService({
      redis,
      client: createSpoonacularClient(fetchImpl, 'test-key'),
      owned: createOwnedRecipeStore([]),
      poolTtlMs: HOUR_MS,
      poolSize: 60,
      deckSize: 15,
    });

    const first = (await pool.dealDeck(pasta)).entries;
    const second = (await pool.dealDeck(pasta)).entries;

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
    const wiped = (await pool.dealDeck(pasta)).entries;

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    expect(next.filter((entry) => wipedIds.has(entry.placeId))).toEqual([]);
  });

  it('tops up with repeats rather than dealing short from a thin pool', async () => {
    // 20 pooled, 15 wiped: only 5 are fresh, so 10 must come back around.
    const { service: pool } = service(recipeHits(20));
    const wiped = (await pool.dealDeck(pasta)).entries;

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    // Fresh first: the five the last deal missed lead the new one.
    expect(next.slice(0, 5).some((entry) => wipedIds.has(entry.placeId))).toBe(false);
  });

  it('reshuffles the wiped deal when the pool has aged out — never an error', async () => {
    const { redis, service: pool } = service(recipeHits(60));
    const wiped = (await pool.dealDeck(pasta)).entries;
    await redis.del(key);

    const next = await pool.redeal(key, wiped);

    expect(next.map((entry) => entry.placeId).sort()).toEqual(
      wiped.map((entry) => entry.placeId).sort()
    );
  });

  it('pays no lookup for a Restart — a cold pool degrades, it does not refetch', async () => {
    const { redis, service: pool, searches } = service(recipeHits(60));
    const wiped = (await pool.dealDeck(pasta)).entries;
    await redis.del(key);

    await pool.redeal(key, wiped);

    expect(searches()).toHaveLength(1);
  });

  it('deals the whole thin pool rather than refusing to Restart', async () => {
    const { service: pool } = service(recipeHits(7));
    const wiped = (await pool.dealDeck(pasta)).entries;

    await expect(pool.redeal(key, wiped)).resolves.toHaveLength(7);
  });
});

describe('the two seams the deal is split into (#327)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  /** A supply as the pool holds it — whole Recipes, no Redis and no source. */
  const supply = (count: number): PooledRecipe[] =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'recipe' as const,
      placeId: String(i + 1),
      name: `Recipe ${i + 1}`,
      photoUrl: `https://img.spoonacular.com/${i + 1}.jpg`,
      aggregateLikes: i,
      servings: 4,
      ingredients: [{ name: 'olive oil', amount: 1, unit: 'tbsp', original: '1 tbsp olive oil' }],
      steps: ['Cook it.'],
    }));

  const inOrder = <T>(entries: T[]): T[] => entries;

  it('cuts a Deck from a supply alone — no Craving, no Redis, no lookup', () => {
    const deck = cutDeck(supply(60), 15, [], inOrder);

    expect(deck).toHaveLength(15);
    expect(deck[0]).toEqual({
      kind: 'recipe',
      placeId: '1',
      name: 'Recipe 1',
      photoUrl: 'https://img.spoonacular.com/1.jpg',
      aggregateLikes: 0,
    });
  });

  it('leads the cut with cards the current Deck missed, then tops up with repeats', () => {
    const pooled = supply(20);
    const current = cutDeck(pooled, 15, [], inOrder);

    const next = cutDeck(pooled, 15, current, inOrder);

    expect(next).toHaveLength(15);
    expect(next.slice(0, 5).map((entry) => entry.placeId)).toEqual(['16', '17', '18', '19', '20']);
  });

  it('reads the Sourced supply as whole Recipes, without dealing anything', async () => {
    const { service: pool, searches } = service(recipeHits(60));

    const sourced = await pool.sourcedSupply(pasta);

    expect(sourced).toHaveLength(60);
    expect(sourced[0].ingredients).toHaveLength(1);
    expect(sourced[0].steps).toEqual(['Cook it.']);
    expect(searches()).toHaveLength(1);
  });

  it('deals from the supply the pool already holds — one fill, then cuts', async () => {
    const { service: pool, searches } = service(recipeHits(60));

    await pool.sourcedSupply(pasta);
    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(searches()).toHaveLength(1);
  });
});

describe('the blend — Owned Recipes in every Cook Deck (#331)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  const key = cravingPoolKey(pasta);
  /** The corpus the fake store is built over, all of it answering `pasta`. */
  const corpus = ownedRecipes(12, { cuisine: 'italian', diets: ['vegetarian'] });
  const isOwned = (entry: { placeId: string }) => entry.placeId.startsWith('owned:');

  it('deals 3 owned and 12 sourced from a healthy vendor', async () => {
    const { service: pool } = service(recipeHits(60), { owned: corpus });

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(deck.filter(isOwned)).toHaveLength(3);
  });

  it('tops the Deck up from owned when the vendor is thin', async () => {
    // Five Sourced Recipes for the Craving: owned covers the other ten rather
    // than letting the Deck come out a third full.
    const { service: pool } = service(recipeHits(5), { owned: corpus });

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(deck.filter(isOwned)).toHaveLength(10);
  });

  it('deals the vendor alone when the corpus has nothing for the Craving', async () => {
    // A Craving the corpus does not answer is the pre-blend world exactly.
    const { service: pool } = service(recipeHits(60), {
      owned: ownedRecipes(12, { cuisine: 'thai' }),
    });

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(deck.filter(isOwned)).toEqual([]);
  });

  it('shuffles owned among sourced rather than reserving them positions', async () => {
    // Reversing is a shuffle the test can predict: owned leads the merge, so
    // if the merged Deck is shuffled they come out at the back. A blend that
    // concatenated the two cuts would leave them at the front.
    const { service: pool } = service(recipeHits(60), {
      owned: corpus,
      shuffle: (entries) => [...entries].reverse(),
    });

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck.slice(-3).every(isOwned)).toBe(true);
  });

  it('holds the floor on a Restart, with fresh cards first within each source', async () => {
    const { service: pool } = service(recipeHits(60), { owned: corpus });
    const wiped = (await pool.dealDeck(pasta)).entries;

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    expect(next.filter(isOwned)).toHaveLength(3);
    // Fresh first is computed per source, so the three owned cards are three
    // the last Deck did not show — never quietly dropping below the floor to
    // find them.
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    expect(next.filter((entry) => wipedIds.has(entry.placeId))).toEqual([]);
  });

  it('holds the floor with a corpus thinner than the floor, rather than dealing short', async () => {
    const { service: pool } = service(recipeHits(60), { owned: corpus.slice(0, 2) });

    const deck = (await pool.dealDeck(pasta)).entries;

    expect(deck).toHaveLength(15);
    expect(deck.filter(isOwned)).toHaveLength(2);
  });

  it('blends the corpus into a Restart of a Craving the vendor answered nothing for', async () => {
    // `[]` is a cached clean miss, not a cold pool (the distinction
    // `sourcedSupply` draws): the corpus is the whole supply and is still
    // there, so a Restart deals its unshown cards rather than reshuffling the
    // same fifteen back at the Session.
    const { service: pool } = service(recipeHits(0), {
      owned: ownedRecipes(20, { cuisine: 'italian', diets: ['vegetarian'] }),
    });
    const wiped = (await pool.dealDeck(pasta)).entries;

    const next = await pool.redeal(key, wiped);

    expect(next).toHaveLength(15);
    const wipedIds = new Set(wiped.map((entry) => entry.placeId));
    expect(next.slice(0, 5).some((entry) => wipedIds.has(entry.placeId))).toBe(false);
  });

  it('reshuffles the wiped Deck when the owned-only supply has gone too', async () => {
    // The corpus ships with the deploy, so "gone" is a redeploy that dropped
    // this Craving's Recipes under a live Session dealt owned-only. Blending
    // would deal nothing; the Restart still deals a Deck.
    const { redis, service: pool } = service(recipeHits(0), { owned: corpus });
    const wiped = (await pool.dealDeck(pasta)).entries;

    const next = await service(recipeHits(0), { redis, owned: [] }).service.redeal(key, wiped);

    expect(next.map((entry) => entry.placeId).sort()).toEqual(
      wiped.map((entry) => entry.placeId).sort()
    );
  });

  it('reads a crowned Owned Recipe whole from the corpus, with no pool at all', async () => {
    // What the Shopping List is minted from (#262). The corpus copy is the
    // only one — nothing owned is ever written to the pool — and it outlives
    // the pool the Sourced cards on the same Deck came from.
    const { redis, service: pool } = service(recipeHits(60), { owned: corpus });
    const deck = (await pool.dealDeck(pasta)).entries;
    const crowned = deck.find(isOwned)!;
    const sourced = deck.find((entry) => !isOwned(entry))!;
    await redis.del(key);

    const recipe = await pool.readRecipe(key, crowned.placeId);

    expect(recipe).toMatchObject({ placeId: crowned.placeId, servings: 4 });
    expect(recipe?.ingredients.length).toBeGreaterThan(0);
    expect(recipe?.steps.length).toBeGreaterThan(0);
    // A Sourced Recipe is still the pool's, and still ages out with it.
    await expect(pool.readRecipe(key, sourced.placeId)).resolves.toBeNull();
  });

  it('reads the Craving back out of the pool key a Restart names', () => {
    // The Restart path carries the pool key, not the Craving — and the key is
    // the canonical Craving, which is exactly what the corpus filters on.
    expect(cravingFromPoolKey(cravingPoolKey(pasta))).toEqual(pasta);
    expect(
      cravingFromPoolKey(
        cravingPoolKey({ mealType: 'dessert', cuisines: ['thai', 'italian'], diets: [] })
      )
    ).toEqual({ mealType: 'dessert', cuisines: ['italian', 'thai'], diets: [] });
  });
});

describe('the vendor-dark latch — dealing while Spoonacular is down (#333)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  /** A corpus deep enough to fill a Deck on its own, all of it answering `pasta`. */
  const deep = ownedRecipes(20, { cuisine: 'italian', diets: ['vegetarian'] });
  /** A corpus that answers the Craving but cannot fill a Deck alone. */
  const thin = ownedRecipes(5, { cuisine: 'italian', diets: ['vegetarian'] });

  it('deals owned alone, and says nothing, when the outage leaves the Deck full', async () => {
    const { service: pool } = service(recipeHits(60), { owned: deep, failWith: 503 });

    const { entries, recipeSourceDown } = await pool.dealDeck(pasta);

    // The branch not darkening is the product: a full Deck is silent.
    expect(entries).toHaveLength(15);
    expect(recipeSourceDown).toBe(false);
  });

  it('says so when the outage is why the deal came up short', async () => {
    const { service: pool } = service(recipeHits(60), { owned: thin, failWith: 503 });

    const { entries, recipeSourceDown } = await pool.dealDeck(pasta);

    expect(entries).toHaveLength(5);
    expect(recipeSourceDown).toBe(true);
  });

  it('says nothing about a thin Craving the vendor answered honestly (#250)', async () => {
    const { service: pool } = service(recipeHits(7));

    const { entries, recipeSourceDown } = await pool.dealDeck(pasta);

    // Thinness the catalogue is telling the truth about is not our outage.
    expect(entries).toHaveLength(7);
    expect(recipeSourceDown).toBe(false);
  });

  it('propagates the failure when owned is empty too', async () => {
    const { service: pool } = service(recipeHits(60), { failWith: 503 });

    await expect(pool.dealDeck(pasta)).rejects.toThrow();
  });

  it('writes nothing to the pool when the vendor fails under an owned-only deal', async () => {
    const { redis, service: pool } = service(recipeHits(60), { owned: deep, failWith: 503 });

    await pool.dealDeck(pasta);

    // A failure remembered as "this Craving has no Recipes" would outlive the
    // outage by the empty pool's whole TTL.
    await expect(redis.exists(cravingPoolKey(pasta))).resolves.toBe(0);
  });

  it.each([
    ['a revoked key', 401],
    ['a payment stop', 402],
  ])('latches on %s, and never calls the vendor again while latched', async (_name, status) => {
    const dark = service(recipeHits(60), { owned: deep, failWith: status });

    await dark.service.dealDeck(pasta);
    await dark.service.dealDeck(pasta);
    await dark.service.dealDeck(pasta);

    expect(dark.searches()).toHaveLength(1);
  });

  it('latches when the points guard refuses the call (#261)', async () => {
    const redis = new RedisMock();
    await redis.set(pointsKey(), '1400');
    const dark = service(recipeHits(60), { redis, owned: deep, pointCeiling: 1400 });

    await dark.service.dealDeck(pasta);

    await expect(redis.exists('recipes:vendor:dark')).resolves.toBe(1);
  });

  it('keeps a transport blip per-call — one failure does not latch', async () => {
    const blip = service(recipeHits(60), { owned: deep, failWith: 503 });

    await blip.service.dealDeck(pasta);
    await blip.service.dealDeck(pasta);

    expect(blip.searches()).toHaveLength(2);
  });

  it('latches once three transport blips land in a row', async () => {
    const blip = service(recipeHits(60), { owned: deep, failWith: 503 });

    for (let i = 0; i < 5; i++) await blip.service.dealDeck(pasta);

    expect(blip.searches()).toHaveLength(3);
  });

  it('ends the blip run on any call the vendor answers', async () => {
    const redis = new RedisMock();
    const blip = service(recipeHits(60), { redis, owned: deep, failWith: 503 });
    await blip.service.dealDeck(pasta);
    await blip.service.dealDeck(pasta);

    // A different Craving, so this deal is a cold fill of its own rather than
    // a warm-pool read that never reaches the vendor.
    await service(recipeHits(60), { redis }).service.dealDeck({ ...pasta, cuisines: ['thai'] });

    await expect(redis.exists('recipes:vendor:blips')).resolves.toBe(0);
  });

  it('re-probes on the next real deal once the window expires, at no probe cost', async () => {
    const redis = new RedisMock();
    const dark = service(recipeHits(60), {
      redis,
      owned: deep,
      failWith: 401,
      vendorDarkTtlMs: 30,
    });
    await dark.service.dealDeck(pasta);
    await dark.service.dealDeck(pasta);
    expect(dark.searches()).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    // Two pages deep, because the dark deal still stepped the Craving's offset.
    const back = service(recipeHits(120), { redis, owned: deep });
    const { entries } = await back.service.dealDeck(pasta);

    // Exactly one call, and it is the deal's own — recovery costs no probe.
    expect(back.searches()).toHaveLength(1);
    expect(entries).toHaveLength(15);
  });

  it('gives up on a vendor that never answers rather than holding up the deal', async () => {
    // A vendor that answers only by hanging. The fake honours the abort the
    // deal-time budget arms, which is what real fetch does with that signal.
    const hangs = ((_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const pool = createRecipePoolService({
      redis: new RedisMock(),
      client: createSpoonacularClient(hangs, 'test-key'),
      owned: createOwnedRecipeStore(deep),
      deckSize: 15,
      ownedFloor: 3,
      dealBudgetMs: 20,
      shuffle: (entries) => entries,
    });

    // The assertion is that this resolves at all: without the budget the deal
    // would wait on the vendor for as long as it cared to hang.
    await expect(pool.dealDeck(pasta)).resolves.toMatchObject({ recipeSourceDown: false });
  });
});

describe('blendDeck — the union rule (#316)', () => {
  const inOrder = <T>(entries: T[]): T[] => entries;
  const supply = (count: number, prefix: string): PooledRecipe[] =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'recipe' as const,
      placeId: `${prefix}-${i + 1}`,
      name: `${prefix} ${i + 1}`,
      ingredients: [],
      steps: [],
    }));

  it('takes the floor from owned and the rest from sourced', () => {
    const deck = blendDeck(supply(10, 'owned'), supply(60, 'sourced'), 15, 3, [], inOrder);

    expect(deck.map((entry) => entry.placeId).slice(0, 4)).toEqual([
      'owned-1',
      'owned-2',
      'owned-3',
      'sourced-1',
    ]);
    expect(deck).toHaveLength(15);
  });

  it('never asks either supply for more than it holds', () => {
    expect(blendDeck(supply(2, 'owned'), supply(4, 'sourced'), 15, 3, [], inOrder)).toHaveLength(6);
    expect(blendDeck([], supply(60, 'sourced'), 15, 3, [], inOrder)).toHaveLength(15);
    expect(blendDeck(supply(20, 'owned'), [], 15, 3, [], inOrder)).toHaveLength(15);
  });

  it('computes fresh-first within each source, not across the merged Deck', () => {
    const owned = supply(6, 'owned');
    const sourced = supply(60, 'sourced');
    const current = blendDeck(owned, sourced, 15, 3, [], inOrder);

    const next = blendDeck(owned, sourced, 15, 3, current, inOrder);

    // Owned's own fresh cards lead its cut even though the merged Deck holds
    // 60 unshown Sourced Recipes that a single pile would have reached for.
    expect(next.map((entry) => entry.placeId).slice(0, 3)).toEqual([
      'owned-4',
      'owned-5',
      'owned-6',
    ]);
  });
});

describe('the Nearest Craving — offering the closest deal there is (#334)', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  const ASIAN = ['chinese', 'indian', 'japanese', 'korean', 'thai', 'vietnamese'] as const;
  const koreanVegan: Craving = {
    mealType: 'main course',
    cuisines: ['korean'],
    diets: ['vegan'],
  };

  it('prices the offer from the corpus and the pools already warm, never the vendor', async () => {
    const { service: pool, searches } = service(recipeHits(60), {
      owned: ownedRecipes(4, { cuisine: 'japanese', diets: ['vegan'] }),
    });
    // A pool already warm for the widened Craving is part of what it can deal.
    await pool.dealDeck({ ...koreanVegan, cuisines: [...ASIAN] });
    const warmed = searches().length;

    const nearest = await pool.nearestCraving(koreanVegan);

    expect(nearest).toEqual({
      craving: { mealType: 'main course', cuisines: [...ASIAN], diets: ['vegan'] },
      label: 'Asian',
      recipeCount: 64,
    });
    // Pricing an offer spends nothing: no lookup, no points, no wait.
    expect(searches()).toHaveLength(warmed);
  });

  it('climbs past a widening the corpus cannot answer to the step that deals', async () => {
    const { service: pool } = service(recipeHits(60), {
      owned: ownedRecipes(3, { cuisine: 'italian', diets: ['vegan'] }),
    });

    const nearest = await pool.nearestCraving(koreanVegan);

    expect(nearest).toMatchObject({ label: 'any cuisine', recipeCount: 3 });
    expect(nearest?.craving.cuisines).toEqual([]);
  });

  it('offers nothing when even the widest step is empty — the refusal stands', async () => {
    const { service: pool, searches } = service(recipeHits(60));

    await expect(pool.nearestCraving(koreanVegan)).resolves.toBeNull();
    expect(searches()).toHaveLength(0);
  });

  it('never offers a diet away, whatever the corpus holds', async () => {
    const { service: pool } = service(recipeHits(60), {
      owned: ownedRecipes(9, { cuisine: 'korean', diets: [] }),
    });

    // Nine korean mains sit right there, and none of them is vegan: the offer
    // is the Craving with its cuisine widened, or there is no offer.
    await expect(pool.nearestCraving(koreanVegan)).resolves.toBeNull();
  });
});

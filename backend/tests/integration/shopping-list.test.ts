// Integration: the Shopping List tracer bullet (#262). A completed Cook
// Session mints a list from its Top Pick, and the list answers from its own
// URL — no live Session, no Participant check, prices as minted. Spoonacular
// and Woolworths are faked at the fetch boundary; everything else (the
// Matcher, the ladder, the politeness queue, Redis) is the real thing.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type Redis from 'ioredis';
import { shoppingListTotal } from '@dinder/shared/types';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { app, sessionService, sessionStore as store } from '../../src/server.js';
import { cravingPoolKey } from '../../src/services/RecipePoolService.js';
import { spoonacularFetchFake, type RecipeSearchHit } from '../helpers/spoonacularFetchFake.js';

const craving = { mealType: 'main course' as const, cuisines: [], diets: [] };

// One Recipe, stated for two, with a line of each interesting kind: a fixed
// pack that prices, a Staple, and an ingredient Woolworths has nothing for.
const hits: RecipeSearchHit[] = [
  {
    id: 11,
    title: 'Aglio e Olio',
    image: 'https://img.test/11.jpg',
    aggregateLikes: 120,
    servings: 2,
    sourceName: 'Full Belly Sisters',
    sourceUrl: 'https://example.test/aglio',
    extendedIngredients: [
      { name: 'canned tomatoes', amount: 200, unit: 'g', original: '200g canned tomatoes' },
      { name: 'salt', amount: 1, unit: 'tsp', original: '1 tsp salt' },
      { name: 'yuzu kosho', amount: 1, unit: 'tbsp', original: '1 tbsp yuzu kosho' },
    ],
    analyzedInstructions: [{ steps: [{ step: 'Boil the pasta.' }, { step: 'Fry the garlic.' }] }],
  },
];

/** One Woolworths search answer, in the raw shape the real endpoint returns. */
const woolworthsAnswer = (products: unknown[]) => ({
  FulfilmentStoreId: 1101,
  Products: products.map((product) => ({ Products: [product] })),
});

const dicedTomatoes = {
  Stockcode: 12345,
  Name: 'Woolworths Diced Tomatoes',
  PackageSize: '400g',
  Price: 1.4,
  InstorePrice: 1.4,
  CupString: '$0.35 / 100G',
  IsAvailable: true,
  AdditionalAttributes: { sapcategoryname: 'CANNED FOOD', sapsubcategoryname: 'TOMATOES' },
};

function fakes() {
  const spoonacular = spoonacularFetchFake({ recipes: hits });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('woolworths.com.au')) {
      if (url.includes('/shop/search/products')) {
        return new Response('<html></html>', {
          status: 200,
          headers: [['set-cookie', 'ak_bmsc=seed; Path=/']],
        });
      }
      const term = (JSON.parse(String(init?.body)) as { SearchTerm: string }).SearchTerm;
      // "yuzu kosho" is the clean miss: the search returns nothing at all.
      return Response.json(woolworthsAnswer(term === 'canned tomatoes' ? [dicedTomatoes] : []));
    }
    return spoonacular.fetchImpl(input, init);
  }) as typeof fetch;
}

describe('Integration Test: a Cook Session mints a Shopping List', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  // Exact keys, never wildcards: the test projects share one Redis and run
  // concurrently, so a `recipes:*` sweep here deletes the pool a Cook-create
  // contract test just filled and fails it with a 404 that has nothing to do
  // with this file. Only this Craving's own pool is ours to clear.
  const poolKey = cravingPoolKey(craving);
  const ownKeys = [poolKey, poolKey.replace('recipes:pool:', 'recipes:offset:')];

  beforeEach(async () => {
    await redis.del(...ownKeys);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fakes());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
    await redis.del(...ownKeys);
  });

  /** A Cook Session decided by one Participant, crowning the only Recipe. */
  async function decided(headcount: number) {
    const { sessionCode } = await sessionService.createSession(
      'Alice',
      undefined,
      undefined,
      'cook',
      {
        craving,
        headcount,
      }
    );
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');
    const { results } = await sessionService.submitSelections(sessionCode, 'alice', ['11']);
    return { sessionCode, results };
  }

  async function readList(listId: string) {
    const response = await request(app).get(`/api/lists/${listId}`);
    return response;
  }

  it('yields a Shopping List URL from the completed Session', async () => {
    const { results } = await decided(4);

    expect(results?.topPick?.restaurant.placeId).toBe('11');
    expect(results?.shoppingListId).toEqual(expect.any(String));
    expect((await readList(results!.shoppingListId!)).status).toBe(200);
  });

  it('opens with the Session gone and asks nobody who they are', async () => {
    const { sessionCode, results } = await decided(4);
    const listId = results!.shoppingListId!;
    // Prove the list is minted before the Session is destroyed, then destroy it.
    expect((await readList(listId)).status).toBe(200);
    await store.deleteSession(sessionCode);

    const response = await readList(listId);

    expect(await store.readSession(sessionCode)).toBeNull();
    expect(response.status).toBe(200);
    expect(response.body.recipeName).toBe('Aglio e Olio');
  });

  it('scales the lines to the Headcount and says what it scaled to', async () => {
    const { results } = await decided(6);

    const { body } = await readList(results!.shoppingListId!);

    expect(body.headcount).toBe(6);
    // 200 g for 2 servings, wanted for 6: 600 g, which is two 400 g tins.
    expect(body.lines[0]).toMatchObject({
      text: '600 g canned tomatoes',
      state: 'priced',
      needs: { amount: 600, unit: 'g' },
      packs: 2,
      priceCents: 280,
      product: { stockcode: 12345, packageSize: '400g' },
    });
  });

  it('lands every line in exactly one of the four states', async () => {
    const { results } = await decided(4);

    const { body } = await readList(results!.shoppingListId!);

    expect(body.lines.map((line: { state: string }) => line.state)).toEqual([
      'priced',
      'unmatched', // the Staple, never looked up
      'unmatched', // Woolworths had nothing for it
    ]);
    expect(body.lines[2]).toMatchObject({ staple: false, searchTerm: 'yuzu kosho' });
  });

  it('keeps Staples out of the list total', async () => {
    const { results } = await decided(4);

    const { body } = await readList(results!.shoppingListId!);

    expect(body.lines[1]).toMatchObject({ staple: true, text: '2 tsp salt' });
    // One priced line: 400 g of tomatoes is one $1.40 tin. The Staple and the
    // miss are both out of the tally, and only the miss is counted as unpriced.
    expect(shoppingListTotal(body.lines)).toEqual({
      cents: 140,
      estimated: false,
      unpricedCount: 1,
    });
  });

  it('snapshots the steps and the credit so cooking outlives the recipe pool', async () => {
    const { results } = await decided(4);
    const listId = results!.shoppingListId!;
    await redis.del(poolKey);

    const { body } = await readList(listId);

    expect(body.steps).toEqual(['Boil the pasta.', 'Fry the garlic.']);
    expect(body.sourceName).toBe('Full Belly Sisters');
    expect(body.sourceUrl).toBe('https://example.test/aglio');
  });

  it('lives 7 days from mint, and reading does not extend it', async () => {
    const { results } = await decided(4);
    const listId = results!.shoppingListId!;
    await readList(listId);

    const ttl = await redis.ttl(`shoppinglist:${listId}`);
    await redis.expire(`shoppinglist:${listId}`, 60);
    await readList(listId);

    expect(ttl).toBeGreaterThan(6 * 24 * 3600);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(await redis.ttl(`shoppinglist:${listId}`)).toBeLessThanOrEqual(60);
  });

  it('outlives the Session that minted it, on its own clock', async () => {
    const { sessionCode, results } = await decided(4);
    await readList(results!.shoppingListId!);

    expect(await store.getSessionTtl(sessionCode)).toBeLessThan(
      await redis.ttl(`shoppinglist:${results!.shoppingListId}`)
    );
  });

  it('re-reads Redis on reopen rather than re-pricing', async () => {
    const { results } = await decided(4);
    const listId = results!.shoppingListId!;
    const first = await readList(listId);

    // Any further Woolworths call would throw on the fake's missing body parse.
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((() => {
      throw new Error('the list must not go back to the Retailer');
    }) as typeof fetch);

    expect((await readList(listId)).body).toEqual(first.body);
  });

  it('404s a list nobody minted', async () => {
    const response = await readList('9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

// Integration: the Shopping List tracer bullet (#262). A completed Cook
// Session mints a list from its Top Pick, and the list answers from its own
// URL — no live Session, no Participant check, prices as minted. Spoonacular
// and Woolworths are faked at the fetch boundary; everything else (the
// Matcher, the ladder, the politeness queue, Redis) is the real thing.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type Redis from 'ioredis';
import { shoppingListTotal, type ShoppingListLine } from '@dinder/shared/types';
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

/** The runner-up behind it: a bigger tin, so a swap moves the price visibly. */
const wholeTomatoes = {
  Stockcode: 67890,
  Name: 'Ardmona Whole Peeled Tomatoes',
  PackageSize: '800g',
  Price: 2.5,
  InstorePrice: 2.5,
  CupString: '$0.31 / 100G',
  IsAvailable: true,
  AdditionalAttributes: { sapcategoryname: 'CANNED FOOD', sapsubcategoryname: 'TOMATOES' },
};

/**
 * What the fixture corpus's Owned Recipe is shopping for. Its line is named
 * "gluten free spaghetti" — cook-honest, and a term Woolworths answers with
 * nothing — so the record authors "spaghetti" beside it (#332), and this is
 * the product only that term reaches.
 */
const glutenFreeSpaghetti = {
  Stockcode: 54321,
  Name: 'San Remo Gluten Free Spaghetti',
  PackageSize: '500g',
  Price: 3,
  InstorePrice: 3,
  CupString: '$0.60 / 100G',
  IsAvailable: true,
  AdditionalAttributes: { sapcategoryname: 'PASTA', sapsubcategoryname: 'DRY PASTA' },
};

/** Every term the Retailer was actually asked for, in order. */
const searched: string[] = [];

function fakes() {
  const spoonacular = spoonacularFetchFake({ recipes: hits });
  searched.length = 0;
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
      searched.push(term);
      // Anything else — "yuzu kosho", "gluten free spaghetti" — is the clean
      // miss: the search returns nothing at all.
      const answers: Record<string, unknown[]> = {
        'canned tomatoes': [dicedTomatoes, wholeTomatoes],
        spaghetti: [glutenFreeSpaghetti],
      };
      return Response.json(woolworthsAnswer(answers[term] ?? []));
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
  const ownKeys = [
    poolKey,
    poolKey.replace('recipes:pool:', 'recipes:offset:'),
    // The price cache lives for a day, so an answer this file's fake gave on a
    // previous run outlives the run — and the shared dev Redis then serves the
    // old candidate list to the new fixtures. Exact keys, never a wildcard: the
    // store is the fake's own 1101, and the terms are this Recipe's own.
    ...['canned tomatoes', 'yuzu kosho', 'spaghetti', 'gluten free spaghetti'].map(
      (term) => `woolworths:price:1101:${term}`
    ),
  ];

  beforeEach(async () => {
    await redis.del(...ownKeys);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fakes());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
    await redis.del(...ownKeys);
  });

  /**
   * A Cook Session decided by one Participant, crowning one dealt Recipe: the
   * vendor's by default, or an Owned one from the fixture corpus the blend
   * deals alongside it (#331).
   */
  async function decided(headcount: number, crowned = '11') {
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
    const { results } = await sessionService.submitSelections(sessionCode, 'alice', [crowned]);
    return { sessionCode, results };
  }

  async function readList(listId: string) {
    const response = await request(app).get(`/api/lists/${listId}`);
    return response;
  }

  /** What the claimer will spend: the same arithmetic as the list total. */
  const tally = (lines: ShoppingListLine[], name: string) =>
    shoppingListTotal(lines.filter((line) => line.claimedBy === name));

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

  it('cooks an Owned Recipe end to end: minted from the corpus, in tally, uncredited', async () => {
    // The whole of #332 in one flow. The crowned card is Owned, so the mint
    // reads it from the corpus — nothing ever writes an `owned:` record to the
    // pool, so the fixture's name and lines below can have come from nowhere
    // else — prices it through the same ladder, and marks the payload `owned`
    // so the Cook View credits nobody. The line reads as the record wrote it
    // while the Retailer is asked for the term the record authored; without
    // that term Woolworths answers "gluten free spaghetti" with nothing, and
    // the line would fall out of the tally.
    const { results } = await decided(4, 'owned:fixture-pasta');

    const { body } = await readList(results!.shoppingListId!);

    expect(results?.topPick?.restaurant.placeId).toBe('owned:fixture-pasta');
    expect(body.recipeName).toBe('Fixture Pasta');
    expect(body.provenance).toBe('owned');
    expect(body.sourceName).toBeUndefined();
    expect(searched).toContain('spaghetti');
    expect(body.lines[0]).toMatchObject({
      text: '400 g gluten free spaghetti',
      state: 'priced',
      packs: 1,
      priceCents: 300,
      product: { stockcode: 54321, packageSize: '500g' },
    });
    // 100% of the non-Staple lines in the tally, per Recipe — what the
    // corpus's own tally gate promises at authoring time (#318).
    const shoppable = body.lines.filter((line: ShoppingListLine) => !line.staple);
    expect(shoppable.map((line: ShoppingListLine) => line.state)).toEqual(['priced']);
    expect(shoppingListTotal(body.lines)).toEqual({
      cents: 300,
      estimated: false,
      unpricedCount: 0,
    });
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

  // Claiming (#263), against the real Redis that decides the race. Every
  // request below carries a display name at most — no session, no participant
  // id, no token — because the URL is the whole capability (#229).
  describe('claiming Ingredient Lines', () => {
    const claimUrl = (listId: string, lineId: string) =>
      `/api/lists/${listId}/lines/${lineId}/claim`;

    const claim = (listId: string, lineId: string, displayName: string) =>
      request(app).post(claimUrl(listId, lineId)).send({ displayName });

    const release = (listId: string, lineId: string) =>
      request(app).delete(claimUrl(listId, lineId));

    /** A minted list, read once so the pricing behind the URL has landed. */
    async function listed(headcount = 4) {
      const { sessionCode, results } = await decided(headcount);
      const listId = results!.shoppingListId!;
      const { body } = await readList(listId);
      return { sessionCode, listId, body };
    }

    /** "9 of 12", derived over non-Staple lines and nothing else. */
    const coverage = (lines: ShoppingListLine[]) => {
      const counted = lines.filter((line) => !line.staple);
      return { claimed: counted.filter((line) => line.claimedBy).length, of: counted.length };
    };

    it('gives a line to exactly one of two Shoppers tapping it together', async () => {
      const { listId } = await listed();

      const [alice, bob] = await Promise.all([
        claim(listId, '0', 'Alice'),
        claim(listId, '0', 'Bob'),
      ]);

      // Both taps get an answer, and both answers name the same winner: the
      // race resolved in Redis, not in whichever request happened to be read
      // back last.
      expect([alice.status, bob.status]).toEqual([200, 200]);
      const holder = alice.body.lines[0].claimedBy;
      expect(['Alice', 'Bob']).toContain(holder);
      expect(bob.body.lines[0].claimedBy).toBe(holder);
      expect((await readList(listId)).body.lines[0].claimedBy).toBe(holder);
    });

    it('lets any Shopper release any Claim, and leaves the line free', async () => {
      const { listId } = await listed();
      await claim(listId, '0', 'Alice');

      // Bob never claimed this line and is not Alice; he can still free it.
      const released = await release(listId, '0');

      expect(released.body.lines[0].claimedBy).toBeUndefined();
      // And taking it over is its own deliberate tap, never a side-effect.
      expect((await claim(listId, '0', 'Bob')).body.lines[0].claimedBy).toBe('Bob');
    });

    it('shows every Shopper the same Claims, which is the live channel working', async () => {
      const { listId } = await listed();

      await claim(listId, '0', 'Alice');

      // A second reader holding nothing but the URL sees Alice's Claim.
      expect((await readList(listId)).body.lines[0].claimedBy).toBe('Alice');
    });

    it("tallies only the claimer's own Priced and Estimated lines", async () => {
      const { listId } = await listed();
      // Line 0 prices at $1.40; line 1 is the Staple; line 2 is the miss.
      await claim(listId, '0', 'Alice');
      await claim(listId, '1', 'Alice');
      await claim(listId, '2', 'Bob');

      const { body } = await readList(listId);

      // Alice claimed a $1.40 tin and a Staple: the Staple counts toward
      // nothing, including her own Tally.
      expect(tally(body.lines, 'Alice')).toEqual({
        cents: 140,
        estimated: false,
        unpricedCount: 0,
      });
      // Bob claimed only the line Woolworths had nothing for: no money, one
      // unpriced item.
      expect(tally(body.lines, 'Bob')).toEqual({ cents: 0, estimated: false, unpricedCount: 1 });
      // And the headline is unmoved by any of it.
      expect(shoppingListTotal(body.lines).cents).toBe(140);
    });

    it('counts coverage over non-Staple lines only', async () => {
      const { listId } = await listed();

      expect(coverage((await readList(listId)).body.lines)).toEqual({ claimed: 0, of: 2 });
      await claim(listId, '0', 'Alice');
      await claim(listId, '1', 'Alice'); // the Staple: claimable, uncounted
      expect(coverage((await readList(listId)).body.lines)).toEqual({ claimed: 1, of: 2 });
      await claim(listId, '2', 'Bob');

      expect(coverage((await readList(listId)).body.lines)).toEqual({ claimed: 2, of: 2 });
    });

    it('claims a Staple like any other line, counting it toward nothing', async () => {
      const { listId } = await listed();

      const { body } = await claim(listId, '1', 'Alice');

      expect(body.lines[1]).toMatchObject({ staple: true, claimedBy: 'Alice' });
      expect(shoppingListTotal(body.lines).cents).toBe(140);
    });

    it('lets someone who was never a Participant claim after the Session is gone', async () => {
      const { sessionCode, listId } = await listed();
      await store.deleteSession(sessionCode);

      // Dana was never in the Session, and there is no Session left to join.
      const response = await claim(listId, '0', 'Dana');

      expect(await store.readSession(sessionCode)).toBeNull();
      expect(response.status).toBe(200);
      expect(response.body.lines[0].claimedBy).toBe('Dana');
    });

    it('keeps the Claims on the list clock, which claiming does not extend', async () => {
      const { listId } = await listed();
      await claim(listId, '0', 'Alice');

      const listTtl = await redis.ttl(`shoppinglist:${listId}`);
      const claimsTtl = await redis.ttl(`shoppinglist:${listId}:claims`);

      // Same seven days, from the same mint — within the second the two writes
      // are apart. A Claim can never outlive the list it is on, or extend it.
      expect(claimsTtl).toBeGreaterThan(6 * 24 * 3600);
      expect(Math.abs(claimsTtl - listTtl)).toBeLessThanOrEqual(1);
    });

    it('answers a claim on a line or list that names nothing with the read 404', async () => {
      const { listId } = await listed();

      expect((await claim(listId, '99', 'Alice')).status).toBe(404);
      expect((await release(listId, '99')).status).toBe(404);
      expect((await claim('9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77', '0', 'Alice')).status).toBe(404);
    });
  });

  // The top-5 swap picker (#264), through the real Matcher, the real ladder and
  // the real Redis. The whole promise is that a confidently-wrong match is a
  // two-tap fix that costs no second Woolworths call and moves the money for
  // everyone holding the URL.
  describe('swapping a wrongly matched product', () => {
    const swap = (listId: string, lineId: string, stockcode: number | null) =>
      request(app).post(`/api/lists/${listId}/lines/${lineId}/swap`).send({ stockcode });

    /** A minted list, read once so the pricing behind the URL has landed. */
    async function listed(headcount = 4) {
      const { results } = await decided(headcount);
      const listId = results!.shoppingListId!;
      const { body } = await readList(listId);
      return { listId, body };
    }

    /** Nothing may reach Woolworths from here on: the candidates are already in. */
    function forbidRetailer() {
      vi.restoreAllMocks();
      vi.spyOn(globalThis, 'fetch').mockImplementation((() => {
        throw new Error('a swap must not go back to the Retailer');
      }) as typeof fetch);
    }

    it('offers the runners-up the one search already fetched', async () => {
      const { body } = await listed();

      expect(body.lines[0].runnersUp).toEqual([
        { stockcode: 67890, name: 'Ardmona Whole Peeled Tomatoes', packageSize: '800g' },
      ]);
      // A Staple was never looked up, so it has nothing to pick between.
      expect(body.lines[1].runnersUp).toBeUndefined();
    });

    it('re-prices the line through the ladder without a second Retailer call', async () => {
      const { listId } = await listed();
      forbidRetailer();

      const { status, body } = await swap(listId, '0', 67890);

      expect(status).toBe(200);
      // 400 g wanted, and the runner-up is one 800 g tin at $2.50.
      expect(body.lines[0]).toMatchObject({
        state: 'priced',
        needs: { amount: 400, unit: 'g' },
        packs: 1,
        priceCents: 250,
        product: { stockcode: 67890, packageSize: '800g' },
      });
      expect(shoppingListTotal(body.lines).cents).toBe(250);
    });

    it('shows the swap to everyone else holding the URL', async () => {
      const { listId } = await listed();
      await swap(listId, '0', 67890);

      const { body } = await readList(listId);

      expect(body.lines[0].product.stockcode).toBe(67890);
      // And the product it was swapped away from is back in the picker.
      expect(body.lines[0].runnersUp.map((p: { stockcode: number }) => p.stockcode)).toEqual([
        12345,
      ]);
    });

    it('demotes the line and drops it from the total when none of them is right', async () => {
      const { listId } = await listed();

      const { body } = await swap(listId, '0', null);

      expect(body.lines[0]).toMatchObject({ state: 'unmatched', searchTerm: 'canned tomatoes' });
      expect(shoppingListTotal(body.lines)).toEqual({
        cents: 0,
        estimated: false,
        unpricedCount: 2,
      });
    });

    it('keeps the Claim, and the Tally, on a line that gets swapped', async () => {
      const { listId } = await listed();
      await request(app).post(`/api/lists/${listId}/lines/0/claim`).send({ displayName: 'Alice' });

      const { body } = await swap(listId, '0', 67890);

      expect(body.lines[0]).toMatchObject({
        claimedBy: 'Alice',
        product: { stockcode: 67890 },
      });
      expect(tally(body.lines, 'Alice').cents).toBe(250);
    });

    it('keeps the swaps on the list clock, which swapping does not extend', async () => {
      const { listId } = await listed();
      await swap(listId, '0', 67890);

      const listTtl = await redis.ttl(`shoppinglist:${listId}`);
      const swapsTtl = await redis.ttl(`shoppinglist:${listId}:swaps`);

      expect(swapsTtl).toBeGreaterThan(6 * 24 * 3600);
      expect(Math.abs(swapsTtl - listTtl)).toBeLessThanOrEqual(1);
    });

    it('lets a demoted line be picked back onto a product, at the minted price', async () => {
      const { listId } = await listed();
      await swap(listId, '0', null);

      const { body } = await swap(listId, '0', 12345);

      expect(body.lines[0]).toMatchObject({ state: 'priced', priceCents: 140 });
      expect(shoppingListTotal(body.lines).cents).toBe(140);
    });

    it('404s a line, a list, or a Stockcode the picker never offered', async () => {
      const { listId } = await listed();

      expect((await swap(listId, '99', 67890)).status).toBe(404);
      // A lineId that is only a property of every object names no line either.
      expect((await swap(listId, 'toString', 67890)).status).toBe(404);
      expect((await swap('9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77', '0', 67890)).status).toBe(404);
      // Not one of this line's five: swapping is not a way to name any product.
      expect((await swap(listId, '0', 11111)).status).toBe(404);
      // And the Staple was never matched, so it has no picker to swap in.
      expect((await swap(listId, '1', 67890)).status).toBe(404);
    });
  });
});

// Quantity ladder unit tests — the #231/#245 failing-line corpus through the
// real client and parser over the Spoonacular fetch fake and ioredis-mock;
// only the boundaries are faked. Convert answers come from #244's measured
// run (chicken breast 226 g/piece, taco seasoning 35 g/packet, coriander's
// lying 8 g/bunch, curry roux's confident 1 g for an ingredient search
// can't find).
import RedisMock from 'ioredis-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductCandidate, ProductMatchOutcome } from '@dinder/shared/types';
import { createQuantityLadder } from '../../src/services/quantityLadder.js';
import { createSpoonacularClient } from '../../src/services/spoonacularClient.js';
import { captureLogs } from '../helpers/logCapture.js';
import { spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const SPOON = {
  ingredients: {
    'chicken breast': { id: 5062, consistency: 'solid' as const },
    'taco seasoning': { id: 93741, consistency: 'solid' as const },
    coriander: { id: 11165, consistency: 'solid' as const },
    'chicken stock': { id: 6172, consistency: 'liquid' as const },
    'sour cream': { id: 1056, consistency: 'solid' as const },
    'tomato paste': { id: 11887, consistency: 'solid' as const },
  },
  gramsPerUnit: {
    'chicken breast:piece': 226,
    'taco seasoning:packet': 35,
    'coriander:bunch': 8, // the lie the herb table must shadow (#244)
    'japanese curry roux:packet': 1, // Convert answering an unknown ingredient
    'tomato paste:tablespoons': 16,
    'sour cream:g': 1,
  },
};

function ladder(spec: Parameters<typeof spoonacularFetchFake>[0] = SPOON) {
  const redis = new RedisMock();
  const { fetchImpl, requests } = spoonacularFetchFake(spec);
  return {
    redis,
    requests,
    ladder: createQuantityLadder({
      redis,
      client: createSpoonacularClient(fetchImpl, 'test-key'),
    }),
  };
}

const matched = (candidate: Partial<ProductCandidate>): ProductMatchOutcome => ({
  status: 'matched',
  match: { stockcode: 1, name: 'product', available: true, ...candidate },
  runnersUp: [],
});

describe('createQuantityLadder', () => {
  beforeEach(async () => {
    // ioredis-mock instances share one store; start each test clean.
    await new RedisMock().flushall();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rung 1, mass family: needs-vs-buy arithmetic, no call made', async () => {
    const { ladder: rungs, requests } = ladder();
    // "400g spaghetti · buy 1 × 500g" and "800g tinned tomatoes · buy 2 × 400g"
    await expect(
      rungs.resolveLine(
        { name: 'spaghetti', amount: 400, unit: 'g' },
        matched({ packageSize: '500g', priceCents: 280 })
      )
    ).resolves.toEqual({
      state: 'priced',
      needs: { amount: 400, unit: 'g' },
      packs: 1,
      priceCents: 280,
    });
    await expect(
      rungs.resolveLine(
        { name: 'tinned tomatoes', amount: 800, unit: 'g' },
        matched({ packageSize: '400g', priceCents: 110 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 2, priceCents: 220 });
    expect(requests).toHaveLength(0);
  });

  it('rung 1, count family: a bare count against an each product', async () => {
    const { ladder: rungs, requests } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'brown onion', amount: 1, unit: '' },
        matched({ packageSize: 'Each', priceCents: 63 })
      )
    ).resolves.toEqual({
      state: 'priced',
      needs: { amount: 1, unit: 'each' },
      packs: 1,
      priceCents: 63,
    });
    expect(requests).toHaveLength(0);
  });

  it('garlic cloves buy a fraction of the each-sold bulb, not one bulb per clove', async () => {
    const { ladder: rungs } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'garlic cloves', amount: 3, unit: '' },
        matched({ packageSize: 'each', priceCents: 90 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 1, priceCents: 90 });
  });

  it('rung 2: Convert bridges count to mass, cached forever by (ingredient, unit)', async () => {
    const { ladder: rungs, requests, redis } = ladder();
    const line = { name: 'chicken breast', amount: 4, unit: '' };
    const pack = matched({ packageSize: '1kg', priceCents: 1200 });

    // 4 breasts × 226 g = 904 g → 1 × 1kg pack
    await expect(rungs.resolveLine(line, pack)).resolves.toEqual({
      state: 'priced',
      needs: { amount: 904, unit: 'g' },
      packs: 1,
      priceCents: 1200,
    });
    const convertCalls = () =>
      requests.filter((request) => request.url.pathname === '/recipes/convert').length;
    expect(convertCalls()).toBe(1);

    // The second resolve answers wholly from cache, and the cache never expires.
    await rungs.resolveLine(line, pack);
    expect(convertCalls()).toBe(1);
    await expect(redis.pttl('spoonacular:convert:chicken breast:piece')).resolves.toBe(-1);
  });

  it('the herb table owns bunch/handful/sprig even though Convert would answer', async () => {
    const { ladder: rungs, requests } = ladder();
    // Convert's fake would say 8 g/bunch; the table says 60 g — 2 bunches
    // against 40g punnets needs 3, not 1.
    await expect(
      rungs.resolveLine(
        { name: 'coriander', amount: 2, unit: 'bunch' },
        matched({ packageSize: '40g', priceCents: 250 })
      )
    ).resolves.toMatchObject({
      state: 'priced',
      needs: { amount: 120, unit: 'g' },
      packs: 3,
      priceCents: 750,
    });
    expect(requests).toHaveLength(0); // the table needs no call at all
    // A sprigs need against a bunch product: one covers it.
    await expect(
      rungs.resolveLine(
        { name: 'rosemary', amount: 3, unit: 'sprigs' },
        matched({ packageSize: 'bunch', priceCents: 300 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 1 });
    // A bunch need against a bunch-sold product divides like any other count.
    await expect(
      rungs.resolveLine(
        { name: 'coriander', amount: 2, unit: 'bunch' },
        matched({ packageSize: 'bunch', priceCents: 250 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 2, priceCents: 500 });
  });

  it('rung 3: 1 g = 1 mL only for liquid-consistency ingredients', async () => {
    const { ladder: rungs } = ladder();
    // Convert has no number for stock; consistency=liquid lets 500 mL = 500 g.
    await expect(
      rungs.resolveLine(
        { name: 'chicken stock', amount: 500, unit: 'ml' },
        matched({ packageSize: '1kg', priceCents: 400 })
      )
    ).resolves.toMatchObject({ state: 'priced', needs: { amount: 500, unit: 'g' }, packs: 1 });
    // 200 g of solid sour cream against a 300mL tub fails the gate honestly (#245).
    await expect(
      rungs.resolveLine(
        { name: 'sour cream', amount: 200, unit: 'g' },
        matched({ packageSize: '300ml', priceCents: 250 })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'grams vs volume pack, not liquid' });
  });

  it("rung 2's gate: Convert's confident answer for an unknown ingredient is ignored", async () => {
    const { ladder: rungs, requests } = ladder();
    // Ingredient search can't find curry roux, so its 1 g "conversion" is
    // never even requested; packet isn't in the vague table → degrade (#244).
    await expect(
      rungs.resolveLine(
        { name: 'japanese curry roux', amount: 1, unit: 'packet' },
        matched({ packageSize: '260g', priceCents: 520 })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'no conversion for "packet"' });
    expect(requests.filter((request) => request.url.pathname === '/recipes/convert')).toHaveLength(
      0
    );
  });

  it('known units still answer: taco seasoning packet → grams → packs', async () => {
    const { ladder: rungs } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'taco seasoning', amount: 1, unit: 'packet' },
        matched({ packageSize: '30g', priceCents: 160 })
      )
    ).resolves.toMatchObject({ state: 'priced', needs: { amount: 35, unit: 'g' }, packs: 2 });
  });

  it('variable-weight packs price as Estimated: unit price × needed mass', async () => {
    const { ladder: rungs } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'chicken thigh fillets', amount: 600, unit: 'g' },
        matched({ packageSize: 'per 150g', cupString: '$15.50 / 1KG' })
      )
    ).resolves.toEqual({
      state: 'estimated',
      needs: { amount: 600, unit: 'g' },
      priceCents: 930,
    });
  });

  it("range packs take the same Estimated path — #245's cheap win", async () => {
    const { ladder: rungs } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'lamb leg', amount: 700, unit: 'g' },
        matched({ packageSize: '750g - 2.2kg', cupString: '$11.00 / 1KG' })
      )
    ).resolves.toEqual({
      state: 'estimated',
      needs: { amount: 700, unit: 'g' },
      priceCents: 770,
    });
    // Without a unit price there is nothing honest to estimate from.
    await expect(
      rungs.resolveLine(
        { name: 'whole chicken', amount: 1600, unit: 'g' },
        matched({ packageSize: '1.8kg - 2.2kg' })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'range pack, no unit price' });
  });

  it('degrades on principle: ranged amounts, unparsed packs, priceless products', async () => {
    const { ladder: rungs } = ladder();
    await expect(
      rungs.resolveLine(
        { name: 'chilli flakes', amount: null, unit: 'tsp' },
        matched({ packageSize: '35g', priceCents: 200 })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'ranged or missing amount' });
    await expect(
      rungs.resolveLine(
        { name: 'kaffir lime leaves', amount: 4, unit: '' },
        matched({ packageSize: 'Serves 4', priceCents: 300 })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'unparsed pack "Serves 4"' });
    await expect(
      rungs.resolveLine(
        { name: 'spaghetti', amount: 400, unit: 'g' },
        matched({ packageSize: '500g', priceCents: undefined })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'no price on product' });
  });

  it('maps a clean miss and a failed search to Unmatched', async () => {
    const { ladder: rungs } = ladder();
    const line = { name: 'taco shells', amount: 12, unit: '' };
    await expect(rungs.resolveLine(line, { status: 'no_product' })).resolves.toEqual({
      state: 'unmatched',
    });
    await expect(rungs.resolveLine(line, { status: 'failed' })).resolves.toEqual({
      state: 'unmatched',
    });
  });

  it('with Convert unreachable, lines resolve via the remaining rungs or degrade — nothing throws', async () => {
    captureLogs();
    const { ladder: rungs, redis } = ladder({ ...SPOON, failWith: 500 });
    // Rung 1 and the herb table never needed Spoonacular.
    await expect(
      rungs.resolveLine(
        { name: 'coriander', amount: 1, unit: 'bunch' },
        matched({ packageSize: '60g', priceCents: 250 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 1 });
    // A line that needed Convert falls through and degrades, unpriced not blocked.
    await expect(
      rungs.resolveLine(
        { name: 'tomato paste', amount: 2, unit: 'tbsp' },
        matched({ packageSize: '130g', priceCents: 240 })
      )
    ).resolves.toEqual({ state: 'unpriced_matched', reason: 'no conversion for "tbsp"' });
    // Failures cache nothing — the next attempt may reach a healed API.
    await expect(redis.keys('spoonacular:*')).resolves.toEqual([]);
  });

  it('cached conversions stay usable while Convert is down', async () => {
    const redis = new RedisMock();
    await redis.set(
      'spoonacular:ingredient:chicken breast',
      JSON.stringify({ known: true, consistency: 'solid' })
    );
    await redis.set('spoonacular:convert:chicken breast:piece', JSON.stringify(226));
    const { fetchImpl } = spoonacularFetchFake({ failWith: 500 });
    const rungs = createQuantityLadder({
      redis,
      client: createSpoonacularClient(fetchImpl, 'test-key'),
    });
    await expect(
      rungs.resolveLine(
        { name: 'chicken breast', amount: 4, unit: '' },
        matched({ packageSize: '1kg', priceCents: 1200 })
      )
    ).resolves.toMatchObject({ state: 'priced', packs: 1, priceCents: 1200 });
  });
});

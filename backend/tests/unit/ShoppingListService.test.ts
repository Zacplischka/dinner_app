// Minting the Shopping List (#262): scale every Ingredient Line to the frozen
// Headcount, run it through the Matcher and the ladder into one of #234's four
// states, and write the answer down once. The Matcher and the ladder are
// injected here — their own behaviour is proved in their own tests; what this
// file owns is the scaling, the Staple rule, mint-once, and the 7-day clock.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductMatchOutcome, QuantityResolution } from '@dinder/shared/types';
import {
  createShoppingListService,
  SHOPPING_LIST_TTL_MS,
} from '../../src/services/ShoppingListService.js';
import type { Session } from '../../src/store/sessionStore.js';
import type { PooledRecipe } from '../../src/services/spoonacularClient.js';

const tin = {
  stockcode: 12345,
  name: 'Woolworths Diced Tomatoes',
  packageSize: '400g',
  available: true,
};

const session: Session = {
  sessionCode: 'AB123',
  hostId: 'host',
  state: 'complete',
  participantCount: 2,
  createdAt: 0,
  lastActivityAt: 0,
  branch: 'cook',
  headcount: 6,
  cravingKey: 'recipes:pool:main course||',
};

const recipe: PooledRecipe = {
  kind: 'recipe',
  placeId: '11',
  name: 'Aglio e Olio',
  servings: 2,
  sourceName: 'Full Belly Sisters',
  sourceUrl: 'https://example.test/aglio',
  steps: ['Boil the pasta.', 'Fry the garlic.'],
  ingredients: [
    { name: 'canned tomatoes', amount: 200, unit: 'g', original: '200g canned tomatoes' },
    { name: 'salt', amount: 1, unit: 'tsp', original: '1 tsp salt' },
  ],
};

/** A store the service can write to and the test can read back. */
function fakeRedis() {
  const keys = new Map<string, { value: string; ttlMs: number }>();
  return {
    keys,
    get: vi.fn(async (key: string) => keys.get(key)?.value ?? null),
    set: vi.fn(async (key: string, value: string, _mode: 'PX', ttlMs: number) => {
      keys.set(key, { value, ttlMs });
      return 'OK' as const;
    }),
  };
}

function build(
  overrides: {
    session?: Session | null;
    recipe?: PooledRecipe | null;
    outcome?: ProductMatchOutcome;
    resolution?: QuantityResolution;
  } = {}
) {
  const redis = fakeRedis();
  const claimed = new Map<string, string>();
  const resolveLine = vi.fn(
    async (): Promise<QuantityResolution> =>
      overrides.resolution ?? {
        state: 'priced',
        needs: { amount: 600, unit: 'g' },
        packs: 2,
        priceCents: 280,
      }
  );
  const matchProduct = vi.fn(
    async (): Promise<ProductMatchOutcome> =>
      overrides.outcome ?? { status: 'matched', match: tin, runnersUp: [] }
  );
  let next = 0;
  const service = createShoppingListService({
    redis,
    readSession: async () => (overrides.session === undefined ? session : overrides.session),
    claimShoppingListId: async (sessionCode, listId) => {
      const existing = claimed.get(sessionCode);
      if (existing) return existing;
      claimed.set(sessionCode, listId);
      return listId;
    },
    readRecipe: async () => (overrides.recipe === undefined ? recipe : overrides.recipe),
    matchProduct,
    resolveLine,
    newListId: () => `00000000-0000-4000-8000-00000000000${next++}`,
    now: () => Date.parse('2026-08-01T10:00:00.000Z'),
  });
  return { service, redis, resolveLine, matchProduct };
}

describe('ShoppingListService.mint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scales every Ingredient Line from the Recipe servings to the Headcount', async () => {
    const { service, resolveLine } = build();

    const listId = await service.mint('AB123', '11');
    const list = await service.readList(listId!);

    // 200 g stated for 2 servings, wanted for 6: the ladder is asked for 600 g.
    expect(resolveLine).toHaveBeenCalledWith(
      { name: 'canned tomatoes', amount: 600, unit: 'g' },
      expect.anything()
    );
    expect(list?.headcount).toBe(6);
    expect(list?.lines[0].text).toBe('600 g canned tomatoes');
  });

  it('scales by nothing when the source never said how many it serves', async () => {
    const { service, resolveLine } = build({ recipe: { ...recipe, servings: undefined } });

    // mint returns the URL and prices behind it, so the read is what waits.
    await service.readList((await service.mint('AB123', '11'))!);

    expect(resolveLine).toHaveBeenCalledWith(
      { name: 'canned tomatoes', amount: 200, unit: 'g' },
      expect.anything()
    );
  });

  it('renders a Priced line with what it needs, what to buy, and what that costs', async () => {
    const { service } = build();

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0]).toEqual({
      id: '0',
      text: '600 g canned tomatoes',
      staple: false,
      state: 'priced',
      needs: { amount: 600, unit: 'g' },
      packs: 2,
      priceCents: 280,
      product: { stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' },
    });
  });

  it('marks an Estimated line and keeps its product card', async () => {
    const { service } = build({
      resolution: { state: 'estimated', needs: { amount: 600, unit: 'g' }, priceCents: 774 },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0]).toMatchObject({ state: 'estimated', priceCents: 774 });
  });

  it('keeps the product card on an Unpriced-matched line and shows no price', async () => {
    const { service } = build({
      resolution: { state: 'unpriced_matched', reason: 'unparsed pack ""' },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0]).toEqual({
      id: '0',
      text: '600 g canned tomatoes',
      staple: false,
      state: 'unpriced_matched',
      product: { stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' },
    });
    // The reason is a log diagnostic, never a wire field to branch or render on.
    expect(JSON.stringify(list)).not.toContain('unparsed pack');
  });

  it('degrades an Unmatched line to its recipe text plus a Retailer search term', async () => {
    const { service } = build({
      outcome: { status: 'no_product' },
      resolution: { state: 'unmatched' },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0]).toEqual({
      id: '0',
      text: '600 g canned tomatoes',
      staple: false,
      state: 'unmatched',
      searchTerm: 'canned tomatoes',
    });
  });

  it('flags Staples and never spends a Retailer lookup on one', async () => {
    const { service, matchProduct } = build();

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[1]).toMatchObject({ staple: true, state: 'unmatched', text: '3 tsp salt' });
    expect(matchProduct).toHaveBeenCalledTimes(1);
    expect(matchProduct).toHaveBeenCalledWith('canned tomatoes');
  });

  it('snapshots the steps and the source credit into the payload', async () => {
    const { service } = build();

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.steps).toEqual(['Boil the pasta.', 'Fry the garlic.']);
    expect(list?.sourceName).toBe('Full Belly Sisters');
    expect(list?.sourceUrl).toBe('https://example.test/aglio');
    expect(list?.recipeName).toBe('Aglio e Olio');
    expect(list?.mintedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('writes the list under a fixed 7-day TTL', async () => {
    const { service, redis } = build();

    const listId = await service.mint('AB123', '11');
    await service.readList(listId!);

    expect(redis.set).toHaveBeenCalledWith(
      `shoppinglist:${listId}`,
      expect.any(String),
      'PX',
      SHOPPING_LIST_TTL_MS
    );
    expect(SHOPPING_LIST_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('mints once per Session — a second completion re-reads and never re-prices', async () => {
    const { service, resolveLine } = build();

    const first = await service.mint('AB123', '11');
    const second = await service.mint('AB123', '11');

    expect(second).toBe(first);
    expect(resolveLine).toHaveBeenCalledTimes(1);
  });

  it('reading twice costs nothing beyond the mint', async () => {
    const { service, matchProduct } = build();
    const listId = await service.mint('AB123', '11');

    const first = await service.readList(listId!);
    const second = await service.readList(listId!);

    expect(second).toEqual(first);
    expect(matchProduct).toHaveBeenCalledTimes(1);
  });

  it('mints nothing when the crowned Recipe has aged out of its pool', async () => {
    const { service, redis } = build({ recipe: null });

    expect(await service.mint('AB123', '11')).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('mints nothing for a Session that captured no Cook setup', async () => {
    const { service } = build({ session: { ...session, cravingKey: undefined } });

    expect(await service.mint('AB123', '11')).toBeUndefined();
  });

  it('answers null for a list id nobody minted', async () => {
    const { service } = build();

    expect(await service.readList('00000000-0000-4000-8000-999999999999')).toBeNull();
  });
});

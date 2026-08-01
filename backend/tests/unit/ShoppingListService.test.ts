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
    del: vi.fn(async (key: string) => (keys.delete(key) ? 1 : 0)),
  };
}

function build(
  overrides: {
    session?: Session | null;
    recipe?: PooledRecipe | null;
    outcome?: ProductMatchOutcome;
    resolution?: QuantityResolution;
    /** Redis refuses the final write, the one way a mint actually fails. */
    failWrite?: boolean;
    failWriteOnce?: boolean;
    /** Parks the mint mid-price, so the test can stand in front of one still running. */
    holdMint?: boolean;
    onRelease?: (listId: string) => void;
    /** Runs with the claim just taken — the narrowest window a rival can land in. */
    onClaimed?: () => Promise<void>;
  } = {}
) {
  const redis = fakeRedis();
  let writesFailed = 0;
  const writeShouldFail = () =>
    overrides.failWrite === true || (overrides.failWriteOnce === true && writesFailed++ === 0);
  const realSet = redis.set;
  redis.set = vi.fn(async (key: string, value: string, mode: 'PX', ttlMs: number) => {
    // Only the list write — the minting marker shares the key and must land,
    // otherwise the failure being staged is a different one.
    if (ttlMs === SHOPPING_LIST_TTL_MS && writeShouldFail()) throw new Error('Redis unavailable');
    return realSet(key, value, mode, ttlMs);
  }) as typeof redis.set;
  // `hold` parks every new mint; `open` releases the one already parked. A mint
  // left parked forever is the process dying mid-price.
  const mintGate = { hold: overrides.holdMint === true, open: () => {} };
  const parked = new Promise<void>((resolve) => {
    mintGate.open = resolve;
  });
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
  const matchProduct = vi.fn(async (): Promise<ProductMatchOutcome> => {
    if (mintGate.hold) await parked;
    return overrides.outcome ?? { status: 'matched', match: tin, runnersUp: [] };
  });
  let next = 0;
  const deps = {
    redis,
    // The claim lives on the Session, so the Session is where a reader of it
    // finds one — exactly as the store writes it.
    readSession: async () => {
      const base = overrides.session === undefined ? session : overrides.session;
      return base && { ...base, shoppingListId: claimed.get(base.sessionCode) };
    },
    claimShoppingListId: async (sessionCode: string, listId: string) => {
      const existing = claimed.get(sessionCode);
      if (existing) return existing;
      claimed.set(sessionCode, listId);
      await overrides.onClaimed?.();
      return listId;
    },
    releaseShoppingListId: async (sessionCode: string, listId: string) => {
      if (claimed.get(sessionCode) === listId) claimed.delete(sessionCode);
      overrides.onRelease?.(listId);
    },
    readRecipe: async () => (overrides.recipe === undefined ? recipe : overrides.recipe),
    matchProduct,
    resolveLine,
    newListId: () => `00000000-0000-4000-8000-00000000000${next++}`,
    now: () => Date.parse('2026-08-01T10:00:00.000Z'),
    pollMs: 1,
  };
  const service = createShoppingListService(deps);
  // A second backend instance: same Redis, same Session, no shared memory —
  // which is the whole point of the marker.
  const otherInstance = () => createShoppingListService(deps);
  return { service, otherInstance, mintGate, redis, resolveLine, matchProduct };
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

  it('records the servings it scaled from, so the page can only claim a real scale', async () => {
    const { service } = build();

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.servings).toBe(2);
  });

  it('leaves servings off when the source never said', async () => {
    const { service } = build({ recipe: { ...recipe, servings: undefined } });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.servings).toBeUndefined();
  });

  // A list outlives deployments (ADR 0001's stated trigger for versioning),
  // so a record this build cannot read must read as gone, never as a list.
  it('refuses a stored list written under another shape', async () => {
    const { service, redis } = build();
    const listId = (await service.mint('AB123', '11'))!;
    await service.readList(listId);
    const stored = JSON.parse(redis.keys.get(`shoppinglist:${listId}`)!.value) as {
      version: number;
    };
    redis.keys.set(`shoppinglist:${listId}`, {
      value: JSON.stringify({ ...stored, version: stored.version + 1 }),
      ttlMs: 1,
    });

    expect(await service.readList(listId)).toBeNull();
  });

  it('releases the claim when the mint fails, so the URL is not dead forever', async () => {
    const released: string[] = [];
    const { service } = build({ failWrite: true, onRelease: (listId) => released.push(listId) });

    const listId = await service.mint('AB123', '11');
    await service.readList(listId!);

    expect(released).toEqual([listId]);
  });

  it('mints again after a failed mint rather than re-serving the dead id', async () => {
    const { service } = build({ failWriteOnce: true });

    const dead = await service.mint('AB123', '11');
    expect(await service.readList(dead!)).toBeNull();

    const retry = await service.mint('AB123', '11');

    expect(retry).not.toBe(dead);
    expect(await service.readList(retry!)).toMatchObject({ recipeName: 'Aglio e Olio' });
  });

  it('still mints once when two completions land together', async () => {
    const { service, resolveLine } = build();

    const [first, second] = await Promise.all([
      service.mint('AB123', '11'),
      service.mint('AB123', '11'),
    ]);
    await service.readList(first!);

    expect(second).toBe(first);
    expect(resolveLine).toHaveBeenCalledTimes(1);
  });

  // #274: the claim is only as live as the marker under it, so the winner must
  // never be catchable between taking an id and marking it — a rival landing in
  // that gap would read a live claim as abandoned and price the Top Pick twice.
  it('still mints once when a second completion lands the instant the claim is taken', async () => {
    let raced = false;
    let racer: string | undefined;
    const suite = build({
      onClaimed: async () => {
        if (raced) return;
        raced = true;
        racer = await suite.service.mint('AB123', '11');
      },
    });

    const first = await suite.service.mint('AB123', '11');
    await suite.service.readList(first!);

    expect(racer).toBe(first);
    expect(suite.resolveLine).toHaveBeenCalledTimes(1);
  });

  // #274: the marker is the only thing two backend instances share, so it is
  // the only thing that can tell the second one a mint is under way.
  it('lets a reader on another instance wait out a mint it did not start', async () => {
    const { service, otherInstance, mintGate } = build({ holdMint: true });
    const listId = (await service.mint('AB123', '11'))!;

    const reading = otherInstance().readList(listId);
    // Long enough that a reader who was going to give up already has.
    await new Promise((resolve) => setTimeout(resolve, 5));
    mintGate.open();

    expect(await reading).toMatchObject({ recipeName: 'Aglio e Olio' });
  });

  // #274: a deploy restart or an OOM mid-price leaves the Session naming a list
  // nothing ever wrote. The claim has to die with the mint, not with the Session.
  it('mints again once an abandoned mint has expired, instead of answering with a dead id', async () => {
    const { service, redis, mintGate } = build({ holdMint: true });
    const dead = (await service.mint('AB123', '11'))!;

    // The process dies here: no list is ever written, and the marker holding
    // the claim expires on its own.
    redis.keys.delete(`shoppinglist:${dead}`);
    expect(await service.readList(dead)).toBeNull();

    mintGate.hold = false;
    const retry = (await service.mint('AB123', '11'))!;

    expect(retry).not.toBe(dead);
    expect(await service.readList(retry)).toMatchObject({ recipeName: 'Aglio e Olio' });
  });

  it('keeps answering with the id it minted while that list is still there', async () => {
    const { service } = build();
    const listId = await service.mint('AB123', '11');
    await service.readList(listId!);

    expect(await service.mint('AB123', '11')).toBe(listId);
  });
});

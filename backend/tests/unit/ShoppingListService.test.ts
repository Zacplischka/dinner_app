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

/** The runners-up the one search already paid for — the swap picker's stock. */
const runnersUp = [
  { stockcode: 222, name: 'Ardmona Rich & Thick Tomatoes', packageSize: '400g', available: true },
  { stockcode: 333, name: 'Mutti Polpa', packageSize: '400g', available: true },
];

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

/**
 * An Owned Recipe whose line authors its own Retailer term (#332). The pilot's
 * conflict: the culinary gate demands diet-qualified names, the tally gate
 * needs matchable ones — so the name stays cook-honest and `searchTerm`
 * carries the term Woolworths can answer. Stated for the Headcount, so the
 * scale is not what this is about.
 */
const authored: PooledRecipe = {
  ...recipe,
  placeId: 'owned:gf-stew',
  servings: 6,
  ingredients: [
    {
      name: 'gluten free vegetable stock',
      amount: 500,
      unit: 'ml',
      original: '500 ml gluten-free vegetable stock',
      searchTerm: 'vegetable stock',
    },
  ],
};

/** A store the service can write to and the test can read back. */
function fakeRedis() {
  const keys = new Map<string, { value: string; ttlMs: number }>();
  // The Claims and Swaps hashes, beside the list strings exactly as in Redis.
  // `diesAt` is what PEXPIREAT was last told, which is the whole of the TTL
  // story here.
  const hashes = new Map<string, Map<string, string>>();
  const diesAt = new Map<string, number>();
  const hash = (key: string) => hashes.get(key) ?? hashes.set(key, new Map()).get(key)!;
  return {
    keys,
    hashes,
    diesAt,
    get: vi.fn(async (key: string) => keys.get(key)?.value ?? null),
    set: vi.fn(async (key: string, value: string, _mode: 'PX', ttlMs: number) => {
      keys.set(key, { value, ttlMs });
      return 'OK' as const;
    }),
    del: vi.fn(async (key: string) => (keys.delete(key) ? 1 : 0)),
    hdel: vi.fn(async (key: string, field: string) => (hash(key).delete(field) ? 1 : 0)),
    hgetall: vi.fn(async (key: string) => Object.fromEntries(hash(key))),
    // The chained MULTI: queued on the way in, run together on exec, exactly
    // as Redis does — so a test can never see one of the pair without the other.
    multi: vi.fn(() => {
      const queued: Array<() => void> = [];
      const chain = {
        // Writes only into an empty field — the whole of first-tap-wins.
        hsetnx(key: string, field: string, value: string) {
          queued.push(() => void (hash(key).has(field) || hash(key).set(field, value)));
          return chain;
        },
        // A swap overwrites, unlike a Claim: the last correction is the one on
        // the list, and there is no race to win.
        hset(key: string, field: string, value: string) {
          queued.push(() => void hash(key).set(field, value));
          return chain;
        },
        pexpireat(key: string, at: number) {
          queued.push(() => void diesAt.set(key, at));
          return chain;
        },
        exec: async () => queued.forEach((run) => run()),
      };
      return chain;
    }),
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
  // Priced by whichever candidate it was handed, so a swap's re-price is
  // visible as a different number rather than taken on trust.
  const resolveLine = vi.fn(
    async (_ingredient: unknown, outcome: ProductMatchOutcome): Promise<QuantityResolution> =>
      overrides.resolution ?? {
        state: 'priced',
        needs: { amount: 600, unit: 'g' },
        packs: 2,
        priceCents:
          outcome.status === 'matched' && outcome.match.stockcode !== tin.stockcode ? 500 : 280,
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
      // The search found the one product, so the picker is empty — but it is
      // there, because "none of these" is still an answer (#264).
      runnersUp: [],
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
      runnersUp: [],
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

  it('derives the search term from the ingredient, not a slice of raw recipe text', async () => {
    // #285's live-list failures: "4.5 cups of water" minting q=of water,
    // "0.5 cloves 6 garlic" minting q=6 garlic.
    const { service } = build({
      recipe: {
        ...recipe,
        ingredients: [
          { name: 'of water', amount: 4.5, unit: 'cups', original: '4.5 cups of water' },
        ],
      },
      outcome: { status: 'no_product' },
      resolution: { state: 'unmatched' },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0]).toMatchObject({ state: 'unmatched', searchTerm: 'water' });
  });

  it('searches an Owned Recipe’s searchTerm while the line still reads the honest name', async () => {
    // #336: a name kept cook-honest for the culinary gate ("gluten free
    // vegetable stock") searches like nothing, so the corpus authors the
    // matchable term beside it — and everything that searches takes that one.
    const { service, matchProduct, resolveLine } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          {
            name: 'gluten free vegetable stock',
            searchTerm: 'vegetable stock',
            amount: 500,
            unit: 'ml',
            original: '500 ml gluten free vegetable stock',
          },
        ],
      },
      outcome: { status: 'no_product' },
      resolution: { state: 'unmatched' },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(matchProduct).toHaveBeenCalledWith('vegetable stock');
    expect(resolveLine).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'vegetable stock' }),
      expect.anything()
    );
    expect(list?.lines[0]).toMatchObject({
      text: '500 ml gluten free vegetable stock',
      state: 'unmatched',
      searchTerm: 'vegetable stock',
    });
  });

  it('searches the Retailer for an authored term, and still renders the line as written', async () => {
    // What an Owned Recipe buys with `searchTerm` (#332): "gluten free
    // vegetable stock" is what the cook reads and what the culinary gate
    // demands, "vegetable stock" is what Woolworths can answer.
    const { service, matchProduct } = build({ recipe: authored });

    const list = await service.readList((await service.mint('AB123', 'owned:gf-stew'))!);

    expect(matchProduct).toHaveBeenCalledWith('vegetable stock');
    expect(list?.lines[0]).toMatchObject({
      text: '500 ml gluten free vegetable stock',
      state: 'priced',
    });
  });

  it('derives the authored term too, so the link and the search stay one term', async () => {
    // The one-derivation rule (#285) on the authored path: `matchProduct`
    // derives whatever it is handed, so an authored term that is not already
    // normalised — "Vegetable Broth", which the US→AU table answers — would
    // otherwise search "vegetable stock" and hand the Shopper "Vegetable
    // Broth". Nothing makes an author normalise, so the mint does.
    const { service } = build({
      recipe: {
        ...authored,
        ingredients: [{ ...authored.ingredients[0], searchTerm: 'Vegetable Broth' }],
      },
      outcome: { status: 'no_product' },
      resolution: { state: 'unmatched' },
    });

    const list = await service.readList((await service.mint('AB123', 'owned:gf-stew'))!);

    expect(list?.lines[0]).toMatchObject({ searchTerm: 'vegetable stock' });
  });

  it('merges an ingredient stated twice into one claimable line, amounts combined', async () => {
    // The production duplicate (#286): 1.5 cups jjapsahl twice, as two
    // separately claimable lines — two Shoppers buying what is one ingredient.
    const { service, matchProduct } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          { name: 'jjapsahl', amount: 1.5, unit: 'cups', original: '1.5 cups jjapsahl' },
          { name: 'jjapsahl', amount: 1.5, unit: 'cups', original: '1.5 cups jjapsahl' },
        ],
      },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines).toHaveLength(1);
    expect(list?.lines[0]).toMatchObject({ id: '0', text: '3 cups jjapsahl' });
    expect(matchProduct).toHaveBeenCalledTimes(1);
  });

  it('strips an embedded quantity phrase so the line renders one coherent amount', async () => {
    // The production hybrids (#286): "0.5 lb 5 pieces chicken breasts" and
    // "0.5 cloves 6 garlic" — the source's own count phrase inside the name.
    const { service, matchProduct } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          {
            name: '5 pieces chicken breasts',
            amount: 0.5,
            unit: 'lb',
            original: '5 chicken breasts, about 1.5 lbs',
          },
          { name: '6 garlic', amount: 0.5, unit: 'cloves', original: '6 cloves garlic, minced' },
        ],
      },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0].text).toBe('0.5 lb chicken breasts');
    expect(list?.lines[1].text).toBe('0.5 cloves garlic');
    // The cleaned name is also what the Matcher is asked for — the polluted
    // one finds a frozen snack instead of the fillet (#287).
    expect(matchProduct).toHaveBeenCalledWith('chicken breasts');
    expect(matchProduct).toHaveBeenCalledWith('garlic');
  });

  it('mints the #305 corpus lines with a single unit, never the doubled pair', async () => {
    // Recipe 636360, exactly as Spoonacular parses it: the metric rewrite put
    // "250/gr" in the structured amount but left the imperial token in the
    // name, and the minted text doubled up ("250 gr lb. of fettuccini pasta").
    const { service } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          {
            name: '.5 lb. of fettuccini pasta',
            amount: 250,
            unit: 'gr',
            original: '250gr / 0.5 lb. (dry weight) of good quality fettuccini pasta',
          },
          {
            name: '.2 lb. brussels sprouts',
            amount: 550,
            unit: 'gr',
            original: '550gr / 1.2 lb. Brussels sprouts, cleaned and chopped quite finely',
          },
          {
            name: 'oz. bacon into pieces',
            amount: 150,
            unit: 'gr',
            original: '150gr / 5 oz. smoked bacon chopped into small pieces',
          },
          {
            name: '.5 oz. parmesan cheese',
            amount: 75,
            unit: 'gr',
            original: '75gr / 2.5 oz. finely grated parmesan cheese',
          },
        ],
      },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines.map((line) => line.text)).toEqual([
      '250 g fettuccini pasta',
      '550 g brussels sprouts',
      '150 g bacon into pieces',
      '75 g parmesan cheese',
    ]);
  });

  it('degrades a line it cannot clean to the recipe own wording, never a hybrid', async () => {
    const { service } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          // "oz" eaten out of mid-word mozzarella: uncleanable name.
          {
            name: 'm zarella cheese',
            amount: 0.4,
            unit: 'oz',
            original: '4 ounces mozzarella cheese, shredded',
          },
          // A portion unit says nothing buyable: "2 servings scallions".
          { name: 'scallions', amount: 2, unit: 'servings', original: '2 scallions, sliced' },
        ],
      },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines[0].text).toBe('4 ounces mozzarella cheese, shredded');
    expect(list?.lines[1].text).toBe('2 scallions, sliced');
  });

  it('merges duplicate degraded lines on their shared source wording', async () => {
    const { service } = build({
      recipe: {
        ...recipe,
        servings: undefined,
        ingredients: [
          { name: 'm zarella cheese', amount: 0.4, unit: 'oz', original: '4 oz mozzarella' },
          { name: 'm zarella cheese', amount: 0.4, unit: 'oz', original: '4 oz mozzarella' },
        ],
      },
    });

    const list = await service.readList((await service.mint('AB123', '11'))!);

    expect(list?.lines).toHaveLength(1);
    expect(list?.lines[0].text).toBe('4 oz mozzarella');
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
    // Absent provenance is Sourced, and the Cook View reads it as Spoonacular.
    expect(list?.provenance).toBeUndefined();
  });

  it('marks a list minted from an Owned Recipe as owned, so nothing credits a source', async () => {
    // An Owned Recipe names no source and the absence is correct (ADR 0012) —
    // but a Sourced Recipe that lost its name still owes the vendor a credit,
    // so the Cook View is told outright rather than left to infer it (#314).
    const { service } = build({
      recipe: {
        ...recipe,
        placeId: 'owned:aglio-e-olio',
        sourceName: undefined,
        sourceUrl: undefined,
      },
    });

    const list = await service.readList((await service.mint('AB123', 'owned:aglio-e-olio'))!);

    expect(list?.provenance).toBe('owned');
    expect(list?.sourceName).toBeUndefined();
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

// Claiming (#263). The exclusivity is Redis's — HSETNX decides the race in one
// round trip — so what this file owns is what the service builds on top of it:
// which lines can be claimed, whose name comes back, and the clock the Claims
// keep.
describe('ShoppingListService claims', () => {
  beforeEach(() => vi.clearAllMocks());

  /** A minted list, ready to be claimed on. */
  async function minted() {
    const built = build();
    const listId = (await built.service.mint('AB123', '11'))!;
    await built.service.readList(listId);
    return { ...built, listId };
  }

  it('attaches the Shopper to the line they claimed, and nothing else', async () => {
    const { service, listId } = await minted();

    const list = await service.claimLine(listId, '0', 'Alice');

    expect(list?.lines[0].claimedBy).toBe('Alice');
    expect(list?.lines[1].claimedBy).toBeUndefined();
  });

  it('gives the second tapper the first tapper name, not the line', async () => {
    const { service, listId } = await minted();
    await service.claimLine(listId, '0', 'Alice');

    const list = await service.claimLine(listId, '0', 'Bob');

    expect(list?.lines[0].claimedBy).toBe('Alice');
  });

  it('resolves two simultaneous taps to exactly one Claim', async () => {
    const { service, listId } = await minted();

    const [first, second] = await Promise.all([
      service.claimLine(listId, '0', 'Alice'),
      service.claimLine(listId, '0', 'Bob'),
    ]);

    expect(first?.lines[0].claimedBy).toBe(second?.lines[0].claimedBy);
    expect(['Alice', 'Bob']).toContain(first?.lines[0].claimedBy);
  });

  it('lets any Shopper release any Claim, own or not', async () => {
    const { service, listId } = await minted();
    await service.claimLine(listId, '0', 'Alice');

    const list = await service.releaseLine(listId, '0');

    expect(list?.lines[0].claimedBy).toBeUndefined();
  });

  it('leaves a released line free for whoever deliberately takes it next', async () => {
    const { service, listId } = await minted();
    await service.claimLine(listId, '0', 'Alice');
    await service.releaseLine(listId, '0');

    const list = await service.claimLine(listId, '0', 'Bob');

    expect(list?.lines[0].claimedBy).toBe('Bob');
  });

  it('claims a Staple like any other line', async () => {
    const { service, listId } = await minted();

    const list = await service.claimLine(listId, '1', 'Alice');

    expect(list?.lines[1]).toMatchObject({ staple: true, claimedBy: 'Alice' });
  });

  it('carries the Claims into every later read of the list', async () => {
    const { service, listId } = await minted();
    await service.claimLine(listId, '0', 'Alice');

    expect((await service.readList(listId))?.lines[0].claimedBy).toBe('Alice');
  });

  it('dies with the list it is on, and claiming extends nothing', async () => {
    const { service, redis, listId } = await minted();

    await service.claimLine(listId, '0', 'Alice');

    // Seven days from the mint, not from the tap: a list worked all week is
    // still gone on the day the mint promised (#229).
    expect(redis.diesAt.get(`shoppinglist:${listId}:claims`)).toBe(
      Date.parse('2026-08-01T10:00:00.000Z') + SHOPPING_LIST_TTL_MS
    );
  });

  it('names nothing for a list or a line that does not exist', async () => {
    const { service, listId } = await minted();

    expect(await service.claimLine(listId, '99', 'Alice')).toBeNull();
    expect(await service.releaseLine(listId, '99')).toBeNull();
    expect(
      await service.claimLine('00000000-0000-4000-8000-000000009999', '0', 'Alice')
    ).toBeNull();
    expect(await service.releaseLine('00000000-0000-4000-8000-000000009999', '0')).toBeNull();
  });

  it('will not claim on a list still being priced', async () => {
    const { service, mintGate } = build({ holdMint: true });
    const listId = (await service.mint('AB123', '11'))!;

    // The marker stands under the key, but there are no lines yet to claim.
    expect(await service.claimLine(listId, '0', 'Alice')).toBeNull();
    mintGate.open();
  });

  it('takes a release of an unclaimed line as the no-op it is', async () => {
    const { service, listId } = await minted();

    const list = await service.releaseLine(listId, '0');

    expect(list?.lines[0].claimedBy).toBeUndefined();
  });
});

// The top-5 swap picker (#264): the cure for a confident-wrong Product Match.
// The candidates were all fetched by the one search at mint, so a correction
// costs no Retailer call — it re-prices through the ladder and writes to the
// shared list, where every viewer of the URL sees it.
describe('ShoppingListService swaps', () => {
  beforeEach(() => vi.clearAllMocks());

  /** A minted list whose priced line has runners-up behind it. */
  async function minted() {
    const built = build({ outcome: { status: 'matched', match: tin, runnersUp } });
    const listId = (await built.service.mint('AB123', '11'))!;
    await built.service.readList(listId);
    return { ...built, listId };
  }

  it('offers every runner-up the one search fetched, minus the one on the line', async () => {
    const { service, listId } = await minted();

    const list = await service.readList(listId);

    expect(list?.lines[0].runnersUp).toEqual([
      { stockcode: 222, name: 'Ardmona Rich & Thick Tomatoes', packageSize: '400g' },
      { stockcode: 333, name: 'Mutti Polpa', packageSize: '400g' },
    ]);
  });

  it('still offers the demotion when the search found only the one product', async () => {
    // No runners-up, but the match may still be confidently wrong, and "none of
    // these" is the answer for it — so the picker is there, empty.
    const { service } = build();
    const listId = (await service.mint('AB123', '11'))!;

    const list = await service.readList(listId);

    expect(list?.lines[0].runnersUp).toEqual([]);
    expect(await service.swapLine(listId, '0', null)).toMatchObject({
      lines: [expect.objectContaining({ state: 'unmatched' }), expect.anything()],
    });
  });

  it('never offers, or accepts, a product the store does not have', async () => {
    // Availability only penalises a product in the ranking (#245), so one the
    // store is out of can ride into the stored top-5 — and a price against an
    // empty shelf is worse than no picker at all.
    const soldOut = {
      stockcode: 444,
      name: 'Annalisa Peeled Tomatoes',
      packageSize: '400g',
      available: false,
    };
    const { service } = build({
      outcome: { status: 'matched', match: tin, runnersUp: [...runnersUp, soldOut] },
    });
    const listId = (await service.mint('AB123', '11'))!;

    const list = await service.readList(listId);

    expect(list?.lines[0].runnersUp?.map((product) => product.stockcode)).toEqual([222, 333]);
    // The picker is the only door: naming it around the picker names nothing.
    expect(await service.swapLine(listId, '0', 444)).toBeNull();
  });

  it('reads past a swap it cannot parse rather than losing the whole list', async () => {
    const { service, redis, listId } = await minted();
    // A blob this code did not write — a foreign shape, a half-written value.
    // It must not 500 every read of the list for the rest of its seven days.
    redis.hashes.set(`shoppinglist:${listId}:swaps`, new Map([['0', 'not json at all']]));

    const list = await service.readList(listId);

    expect(list?.lines[0]).toMatchObject({
      state: 'priced',
      priceCents: 280,
      product: { stockcode: 12345 },
    });
    expect(list?.lines[0].runnersUp?.map((product) => product.stockcode)).toEqual([222, 333]);
  });

  it('offers no picker on a line that never had a Match', async () => {
    const { service, listId } = await minted();

    const list = await service.readList(listId);

    // The Staple: never looked up, so there is nothing to pick between.
    expect(list?.lines[1].runnersUp).toBeUndefined();
  });

  it('re-prices the swapped line through the ladder, without a Retailer call', async () => {
    const { service, listId, matchProduct, resolveLine } = await minted();
    matchProduct.mockClear();
    resolveLine.mockClear();

    const list = await service.swapLine(listId, '0', 222);

    expect(list?.lines[0]).toMatchObject({
      state: 'priced',
      priceCents: 500,
      product: { stockcode: 222, name: 'Ardmona Rich & Thick Tomatoes' },
    });
    expect(resolveLine).toHaveBeenCalledWith(
      { name: 'canned tomatoes', amount: 600, unit: 'g' },
      { status: 'matched', match: expect.objectContaining({ stockcode: 222 }), runnersUp: [] }
    );
    expect(matchProduct).not.toHaveBeenCalled();
  });

  it('puts the product it swapped away from back in the picker', async () => {
    const { service, listId } = await minted();

    const list = await service.swapLine(listId, '0', 222);

    expect(list?.lines[0].runnersUp?.map((product) => product.stockcode)).toEqual([12345, 333]);
  });

  it('shows the swap to everyone else holding the URL', async () => {
    const { service, otherInstance, listId } = await minted();
    await service.swapLine(listId, '0', 333);

    const list = await otherInstance().readList(listId);

    expect(list?.lines[0]).toMatchObject({ product: { stockcode: 333 }, priceCents: 500 });
  });

  it('demotes the line to Unmatched when none of them is the right one', async () => {
    const { service, listId } = await minted();

    const list = await service.swapLine(listId, '0', null);

    expect(list?.lines[0]).toMatchObject({ state: 'unmatched', searchTerm: 'canned tomatoes' });
    // Out of the tally, but still shoppable — and still swappable back.
    expect(list?.lines[0].runnersUp?.map((product) => product.stockcode)).toEqual([
      12345, 222, 333,
    ]);
  });

  it('demotes onto the same search term the mint path would have derived', async () => {
    // One derivation for both paths (#285): a demoted "6 garlic" line falls
    // back to q=garlic, exactly as it would have minted Unmatched.
    const { service } = build({
      recipe: {
        ...recipe,
        ingredients: [
          { name: '6 garlic', amount: 0.5, unit: 'cloves', original: '0.5 cloves 6 garlic' },
        ],
      },
      outcome: { status: 'matched', match: tin, runnersUp },
    });
    const listId = (await service.mint('AB123', '11'))!;
    await service.readList(listId);

    const list = await service.swapLine(listId, '0', null);

    expect(list?.lines[0]).toMatchObject({ state: 'unmatched', searchTerm: 'garlic' });
  });

  it('demotes an authored line back onto its own authored term', async () => {
    // Same one-derivation rule (#285) on a record that authored the term
    // rather than leaving it to be derived: a demoted line offers the search
    // it would have minted Unmatched with, never the cook-honest name.
    const { service } = build({
      recipe: authored,
      outcome: { status: 'matched', match: tin, runnersUp },
    });
    const listId = (await service.mint('AB123', 'owned:gf-stew'))!;
    await service.readList(listId);

    const list = await service.swapLine(listId, '0', null);

    expect(list?.lines[0]).toMatchObject({ state: 'unmatched', searchTerm: 'vegetable stock' });
  });

  it('keeps the Claim on a line that gets swapped', async () => {
    const { service, listId } = await minted();
    await service.claimLine(listId, '0', 'Alice');

    const list = await service.swapLine(listId, '0', 222);

    expect(list?.lines[0]).toMatchObject({ claimedBy: 'Alice', product: { stockcode: 222 } });
  });

  it('keeps the line where it is — same id, same recipe text', async () => {
    const { service, listId } = await minted();

    const list = await service.swapLine(listId, '0', 222);

    expect(list?.lines[0]).toMatchObject({ id: '0', text: '600 g canned tomatoes', staple: false });
  });

  it('dies with the list it is on, and swapping extends nothing', async () => {
    const { service, redis, listId } = await minted();

    await service.swapLine(listId, '0', 222);

    expect(redis.diesAt.get(`shoppinglist:${listId}:swaps`)).toBe(
      Date.parse('2026-08-01T10:00:00.000Z') + SHOPPING_LIST_TTL_MS
    );
  });

  it('takes a swap back to the product it demoted, and prices it as before', async () => {
    const { service, listId } = await minted();
    await service.swapLine(listId, '0', null);

    const list = await service.swapLine(listId, '0', 12345);

    // "None of these" is not a one-way door: the same picker is the way back,
    // and the way back re-prices at what the list promised.
    expect(list?.lines[0]).toMatchObject({
      state: 'priced',
      priceCents: 280,
      product: { stockcode: 12345 },
    });
  });

  // The stored Matches come back from JSON.parse wearing Object.prototype, so
  // a lineId that names a method of it must still name nothing.
  it('names nothing for a line id that is only a property of every object', async () => {
    const { service, listId } = await minted();

    for (const lineId of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(await service.swapLine(listId, lineId, 222), lineId).toBeNull();
    }
  });

  it('names nothing for a list, a line, or a product the picker never offered', async () => {
    const { service, listId } = await minted();

    expect(await service.swapLine(listId, '99', 222)).toBeNull();
    expect(await service.swapLine('00000000-0000-4000-8000-000000009999', '0', 222)).toBeNull();
    // A Stockcode off some other list is not one of this line's candidates.
    expect(await service.swapLine(listId, '0', 4242)).toBeNull();
    // And a Staple was never matched, so it has no candidates at all.
    expect(await service.swapLine(listId, '1', 222)).toBeNull();
  });

  it('will not swap on a list still being priced', async () => {
    const { service, mintGate } = build({ holdMint: true });
    const listId = (await service.mint('AB123', '11'))!;

    expect(await service.swapLine(listId, '0', 222)).toBeNull();
    mintGate.open();
  });
});

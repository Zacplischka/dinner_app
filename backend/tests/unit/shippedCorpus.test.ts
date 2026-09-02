// The shipped batch, dealt and cooked (#338). Every suite that boots the app is
// pointed at the fixture corpus by `OWNED_RECIPES_DIR` (vitest.workspace.ts), on
// purpose — those tests state what the blend does, not what ships this week. So
// this is the only place the records under `backend/recipes/` themselves go
// through the real deal and the real mint: `loadOwnedCorpus()` here reads the
// shipped directory, because the unit project sets no override.
//
// The Retailer is a stub. What a real Woolworths answers for these terms is the
// tally layer's measurement (#337, at store 1101) and cannot be had offline —
// this file proves the shipped records reach a Deck, crown, and mint a list
// whose lines route by the term each record authored. It does not prove, and
// must not be read as proving, that the batch is in tally.
import RedisMock from 'ioredis-mock';
import { describe, expect, it, vi } from 'vitest';
import type { Craving, ProductMatchOutcome, QuantityResolution } from '@dinder/shared/types';
import { shoppingListTotal } from '@dinder/shared/types';
import { createRecipePoolService } from '../../src/services/RecipePoolService.js';
import { createShoppingListService } from '../../src/services/ShoppingListService.js';
import {
  createOwnedRecipeStore,
  loadOwnedCorpus,
  type OwnedRecipe,
} from '../../src/services/ownedRecipeStore.js';
import { createSpoonacularClient } from '../../src/services/spoonacularClient.js';
import { isStaple } from '../../src/services/staples.js';
import type { Session } from '../../src/store/sessionStore.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const corpus = loadOwnedCorpus();
const store = createOwnedRecipeStore(corpus);

const craving: Craving = { mealType: 'main course', cuisines: [], diets: [] };

/** One 1 kg pack, priced at $5 — the same answer for every term asked. */
const pack = { stockcode: 999, name: 'A Pack Of It', packageSize: '1kg', available: true };

/**
 * A Deck dealt for `craving` over the shipped corpus and a healthy vendor, with
 * the shuffle stubbed out so the crowned card is the same one on every run.
 */
async function deal() {
  const redis = new RedisMock();
  const service = createRecipePoolService({
    redis,
    client: createSpoonacularClient(
      spoonacularFetchFake({ recipes: recipeHits(60) }).fetchImpl,
      'test-key'
    ),
    owned: store,
    shuffle: (entries) => entries,
  });
  return service.dealDeck(craving);
}

/** The in-memory RedisLike the mint writes its one list into. */
function fakeRedis() {
  const keys = new Map<string, string>();
  const chain = {
    hsetnx: () => chain,
    hset: () => chain,
    pexpireat: () => chain,
    exec: async () => [],
  };
  return {
    get: async (key: string) => keys.get(key) ?? null,
    set: async (key: string, value: string) => void keys.set(key, value),
    del: async (key: string) => void keys.delete(key),
    hdel: async () => 0,
    hgetall: async () => ({}),
    multi: () => chain,
  };
}

/**
 * Mints `recipe`'s Shopping List for a Headcount of 6 and hands back the list
 * beside every term the Retailer was actually asked for, in order.
 */
async function cook(recipe: OwnedRecipe, headcount = 6) {
  const searched: string[] = [];
  const session: Session = {
    sessionCode: 'AB123',
    hostId: 'host',
    state: 'complete',
    participantCount: 1,
    createdAt: 0,
    lastActivityAt: 0,
    branch: 'cook',
    headcount,
    cravingKey: 'recipes:pool:main course||',
  };
  let claimed: string | undefined;
  const service = createShoppingListService({
    redis: fakeRedis(),
    readSession: async () => ({ ...session, shoppingListId: claimed }),
    claimShoppingListId: async (_code, listId) => (claimed ??= listId),
    releaseShoppingListId: async () => {
      claimed = undefined;
    },
    // The corpus is the only copy: nothing ever writes an `owned:` record to the
    // Redis pool, so a list minted here can have come from nowhere else (#332).
    readRecipe: async (_poolKey, placeId) => store.byPlaceId(placeId) ?? null,
    matchProduct: vi.fn(async (term: string): Promise<ProductMatchOutcome> => {
      searched.push(term);
      return { status: 'matched', match: pack, runnersUp: [] };
    }),
    resolveLine: async (): Promise<QuantityResolution> => ({
      state: 'priced',
      needs: { amount: 1, unit: 'kg' },
      packs: 1,
      priceCents: 500,
    }),
    pollMs: 1,
  });

  const listId = await service.mint(session.sessionCode, recipe.placeId);
  return { list: await service.readList(listId!), searched };
}

describe('the shipped batch deals and cooks', () => {
  it('deals its Owned Recipes onto a plain main-course Deck', async () => {
    const { entries } = await deal();

    const owned = entries.filter((entry) => entry.placeId.startsWith('owned:'));
    // The floor the blend guarantees (#316), and every card on it is a record
    // that shipped — not a fixture, and not something read back out of a pool.
    expect(owned.length).toBeGreaterThanOrEqual(3);
    for (const entry of owned) expect(store.byPlaceId(entry.placeId)).toBeDefined();
  });

  it('crowns one and mints its Shopping List from the corpus, uncredited', async () => {
    const { entries } = await deal();
    const crowned = store.byPlaceId(entries.find((e) => e.placeId.startsWith('owned:'))!.placeId)!;

    const { list, searched } = await cook(crowned);

    expect(list?.recipeName).toBe(crowned.name);
    expect(list?.steps).toEqual(crowned.steps);
    expect(list?.servings).toBe(crowned.servings);
    expect(list?.headcount).toBe(6);
    // An Owned Recipe has no source to credit, and the Cook View is told so
    // rather than inferring it from an absent name (ADR 0012).
    expect(list?.provenance).toBe('owned');
    expect(list?.sourceName).toBeUndefined();

    // Every non-Staple line cost exactly one Retailer lookup, and the Staples
    // cost none and count for nothing.
    const shoppable = list!.lines.filter((line) => !line.staple);
    expect(searched).toHaveLength(shoppable.length);
    expect(shoppable.map((line) => line.state)).toEqual(shoppable.map(() => 'priced'));
    expect(shoppingListTotal(list!.lines).unpricedCount).toBe(0);
  });

  it('searches by the term a record authored, never by its cook-honest name', async () => {
    // The pilot's conflict, live on shipped data: the card has to read the way
    // a cook would write it, the Retailer has to be asked something it can
    // answer, so the record carries both and everything downstream of the card
    // searches `searchTerm` (#336). Which terms actually match at store 1101 is
    // the tally layer's to say — this only proves the routing.
    const recipe = corpus.find((r) => r.ingredients.some((i) => i.searchTerm))!;
    const authored = recipe.ingredients.filter((i) => i.searchTerm && !isStaple(i.name));

    const { searched } = await cook(recipe);

    expect(authored.length).toBeGreaterThan(0);
    for (const ingredient of authored) {
      expect(searched).toContain(ingredient.searchTerm);
      expect(searched).not.toContain(ingredient.name);
    }
  });
});

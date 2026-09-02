// The Owned Recipe Store (#331): which Owned Recipes answer a Craving, and the
// shipped corpus the store is built over.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Craving } from '@dinder/shared/types';
import { config } from '../../src/config/index.js';
import {
  createOwnedRecipeStore,
  loadOwnedCorpus,
  type OwnedRecipe,
} from '../../src/services/ownedRecipeStore.js';
import { ownedRecipes } from '../helpers/ownedCorpusFake.js';

const one = (overrides: Partial<OwnedRecipe>): OwnedRecipe => ownedRecipes(1, overrides)[0];

const craving = (overrides: Partial<Craving> = {}): Craving => ({
  mealType: 'main course',
  cuisines: [],
  diets: [],
  ...overrides,
});

describe('forCraving — the Owned Recipe Store filter', () => {
  it('takes only Recipes of the craved meal type', () => {
    const store = createOwnedRecipeStore([
      one({ placeId: 'owned:main', mealType: 'main course' }),
      one({ placeId: 'owned:pud', mealType: 'dessert' }),
    ]);

    expect(store.forCraving(craving()).map((r) => r.placeId)).toEqual(['owned:main']);
  });

  it('takes any cuisine when no chip names one', () => {
    const store = createOwnedRecipeStore([
      one({ placeId: 'owned:it', cuisine: 'italian' }),
      one({ placeId: 'owned:th', cuisine: 'thai' }),
    ]);

    expect(store.forCraving(craving())).toHaveLength(2);
  });

  it('ORs the cuisine chips, the way the chips read', () => {
    const store = createOwnedRecipeStore([
      one({ placeId: 'owned:it', cuisine: 'italian' }),
      one({ placeId: 'owned:th', cuisine: 'thai' }),
      one({ placeId: 'owned:mx', cuisine: 'mexican' }),
    ]);

    expect(
      store.forCraving(craving({ cuisines: ['italian', 'thai'] })).map((r) => r.placeId)
    ).toEqual(['owned:it', 'owned:th']);
  });

  it('keeps a Recipe that claims no cuisine out of a cuisine-chipped Craving', () => {
    // An untagged Recipe is not "every cuisine": the vendor's cuisine filter
    // means tagged-as, and the blend must not answer "italian" with a dish
    // nobody called italian.
    const store = createOwnedRecipeStore([one({ placeId: 'owned:any', cuisine: undefined })]);

    expect(store.forCraving(craving({ cuisines: ['italian'] }))).toEqual([]);
    expect(store.forCraving(craving())).toHaveLength(1);
  });

  it('ANDs the diet chips — every one must be satisfied', () => {
    const store = createOwnedRecipeStore([
      one({ placeId: 'owned:veg', diets: ['vegetarian'] }),
      one({ placeId: 'owned:both', diets: ['vegetarian', 'gluten free'] }),
    ]);

    expect(
      store.forCraving(craving({ diets: ['vegetarian', 'gluten free'] })).map((r) => r.placeId)
    ).toEqual(['owned:both']);
  });

  it('reads vegan ⊆ vegetarian ⊆ pescetarian, so the strictest Recipe answers the looser chip', () => {
    const store = createOwnedRecipeStore([
      one({ placeId: 'owned:vegan', diets: ['vegan'] }),
      one({ placeId: 'owned:vegetarian', diets: ['vegetarian'] }),
      one({ placeId: 'owned:pescetarian', diets: ['pescetarian'] }),
    ]);

    expect(store.forCraving(craving({ diets: ['pescetarian'] })).map((r) => r.placeId)).toEqual([
      'owned:vegan',
      'owned:vegetarian',
      'owned:pescetarian',
    ]);
    expect(store.forCraving(craving({ diets: ['vegetarian'] })).map((r) => r.placeId)).toEqual([
      'owned:vegan',
      'owned:vegetarian',
    ]);
    expect(store.forCraving(craving({ diets: ['vegan'] })).map((r) => r.placeId)).toEqual([
      'owned:vegan',
    ]);
  });
});

describe('loadOwnedCorpus — the record shape', () => {
  const write = (recipe: unknown): URL => {
    const dir = new URL(`${mkdtempSync(join(tmpdir(), 'owned-'))}/`, 'file:');
    mkdirSync(new URL('a-dish/', dir));
    writeFileSync(new URL('a-dish/recipe.json', dir), JSON.stringify(recipe));
    return dir;
  };

  it('keeps an Ingredient Line’s searchTerm, where the name has to stay cook-honest', () => {
    const [record] = ownedRecipes(1, { placeId: 'owned:a-dish' });
    const corpus = loadOwnedCorpus(
      write({
        ...record,
        ingredients: [
          {
            name: 'gluten free vegetable stock',
            searchTerm: 'vegetable stock',
            amount: 500,
            unit: 'ml',
            original: '500 ml gluten free vegetable stock',
          },
        ],
      })
    );

    expect(corpus[0].ingredients[0].searchTerm).toBe('vegetable stock');
  });
});

describe('the shipped corpus', () => {
  const corpus = loadOwnedCorpus();

  it('ships the re-gated pilot batch, not the blend ticket’s provisional seed', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(50);
  });

  it('carries a frozen owned: identity and mandatory servings on every record', () => {
    for (const recipe of corpus) {
      expect(recipe.placeId).toMatch(/^owned:[a-z0-9-]+$/);
      expect(recipe.servings).toBeGreaterThan(0);
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
    }
  });

  it('carries no aggregateLikes — nothing backfills it', () => {
    for (const recipe of corpus) {
      expect(recipe).not.toHaveProperty('aggregateLikes');
    }
  });

  it('can fill the owned floor of a plain main-course Craving', () => {
    expect(createOwnedRecipeStore(corpus).forCraving(craving()).length).toBeGreaterThanOrEqual(3);
  });

  // ADR 0012: the Fact Record is the only persistent artefact of reading, and
  // it commits beside the Recipe it produced as that Recipe's audit trail. The
  // store never reads one, so nothing else would notice it going missing.
  it('commits a Fact Record beside every Recipe, naming its publishers', () => {
    for (const recipe of corpus) {
      const slug = recipe.placeId.replace(/^owned:/, '');
      const fact = JSON.parse(
        readFileSync(new URL(`${slug}/fact.json`, config.ownedRecipesDir), 'utf8')
      ) as { sources?: { url?: string; robots_ok?: boolean }[] };

      expect(fact.sources?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(fact.sources?.every((source) => source.url && source.robots_ok)).toBe(true);
    }
  });
});

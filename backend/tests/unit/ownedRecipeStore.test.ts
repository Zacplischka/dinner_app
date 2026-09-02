// The Owned Recipe Store (#331): which Owned Recipes answer a Craving, and the
// shipped corpus the store is built over.
import { describe, expect, it } from 'vitest';
import type { Craving } from '@dinder/shared/types';
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

describe('the shipped corpus', () => {
  const corpus = loadOwnedCorpus();

  it('ships a seed big enough to deal the floor on a real Craving', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10);
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
});

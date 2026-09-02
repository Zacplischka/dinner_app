// The contract-level fake for the Owned Recipe Store (#331): a handful of
// records at the same seam the Spoonacular client fake occupies — the
// dependency the service is built with, not a new kind of double. The store
// itself is in-memory over an array, so the fake *is* the real store over a
// small corpus; only the records differ.
import type { OwnedRecipe } from '../../src/services/ownedRecipeStore.js';

/** `count` plausible Owned Recipes, so a blend test doesn't hand-write records. */
export function ownedRecipes(count: number, overrides: Partial<OwnedRecipe> = {}): OwnedRecipe[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'recipe' as const,
    placeId: `owned:owned-${i + 1}`,
    name: `Owned ${i + 1}`,
    servings: 4,
    mealType: 'main course' as const,
    cuisine: 'italian' as const,
    diets: [],
    ingredients: [{ name: 'olive oil', amount: 1, unit: 'tbsp', original: '1 tbsp olive oil' }],
    steps: ['Cook it.'],
    ...overrides,
  }));
}

// Spoonacular client unit tests over the fetch fake — the boundary and
// nothing else.
import { describe, expect, it } from 'vitest';
import { createSpoonacularClient } from '../../src/services/spoonacularClient.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const chicken = { 'chicken breast': { id: 5062, consistency: 'solid' as const } };

describe('createSpoonacularClient', () => {
  it('converts one source unit to grams, carrying the pinned browser UA and key', async () => {
    const { fetchImpl, requests } = spoonacularFetchFake({
      gramsPerUnit: { 'chicken breast:piece': 226 },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.gramsPerUnit('chicken breast', 'piece')).resolves.toBe(226);
    expect(requests[0].url.searchParams.get('apiKey')).toBe('test-key');
    // Cloudflare 403s non-browser UAs (#244); the client must look like one.
    expect(requests[0].headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
  });

  it('answers null when Convert returns no number', async () => {
    const { fetchImpl } = spoonacularFetchFake({});
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('mystery', 'piece')).resolves.toBeNull();
  });

  it('reports a searchable ingredient with its consistency', async () => {
    const { fetchImpl } = spoonacularFetchFake({
      ingredients: { ...chicken, 'chicken stock': { id: 6172, consistency: 'liquid' } },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.ingredientInfo('chicken stock')).resolves.toEqual({
      known: true,
      consistency: 'liquid',
    });
    await expect(client.ingredientInfo('japanese curry roux')).resolves.toEqual({
      known: false,
      consistency: null,
    });
  });

  it('throws on an HTTP error so the ladder can fall through', async () => {
    const { fetchImpl } = spoonacularFetchFake({ failWith: 500 });
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('chicken breast', 'piece')).rejects.toThrow('500');
    await expect(client.ingredientInfo('chicken breast')).rejects.toThrow('500');
  });

  describe('searchRecipes', () => {
    const craving = {
      mealType: 'main course' as const,
      cuisines: ['italian' as const, 'thai' as const],
      diets: ['vegetarian' as const],
    };

    it('asks for a pool the Craving filters, with instructions required', async () => {
      const { fetchImpl, requests } = spoonacularFetchFake({ recipes: recipeHits(60) });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await client.searchRecipes(craving, { number: 60, offset: 120 });

      const params = requests[0].url.searchParams;
      expect(requests[0].url.pathname).toBe('/recipes/complexSearch');
      expect(params.get('type')).toBe('main course');
      // Spoonacular ORs a comma-separated cuisine list and ANDs the diets.
      expect(params.get('cuisine')).toBe('italian,thai');
      expect(params.get('diet')).toBe('vegetarian');
      // Every pooled Recipe must be cookable: no instructions, no Shopping List.
      expect(params.get('instructionsRequired')).toBe('true');
      expect(params.get('number')).toBe('60');
      expect(params.get('offset')).toBe('120');
    });

    it('omits the chip params a Craving leaves empty', async () => {
      const { fetchImpl, requests } = spoonacularFetchFake({ recipes: recipeHits(2) });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await client.searchRecipes(
        { mealType: 'dessert', cuisines: [], diets: [] },
        { number: 60, offset: 0 }
      );

      expect(requests[0].url.searchParams.has('cuisine')).toBe(false);
      expect(requests[0].url.searchParams.has('diet')).toBe(false);
    });

    it('maps a hit into the pooled Recipe, ingredients and steps aboard', async () => {
      const { fetchImpl } = spoonacularFetchFake({
        recipes: [
          {
            id: 716429,
            title: 'Pasta with Garlic',
            image: 'https://img.spoonacular.com/716429.jpg',
            aggregateLikes: 209,
            servings: 2,
            sourceUrl: 'https://example.test/pasta',
            sourceName: 'Full Belly Sisters',
            extendedIngredients: [
              { name: 'garlic', amount: 2, unit: 'cloves', original: '2 cloves garlic' },
            ],
            analyzedInstructions: [
              { steps: [{ step: 'Boil the pasta.' }, { step: 'Fry garlic.' }] },
            ],
          },
        ],
      });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      await expect(client.searchRecipes(craving, { number: 60, offset: 0 })).resolves.toEqual([
        {
          kind: 'recipe',
          placeId: '716429',
          name: 'Pasta with Garlic',
          photoUrl: 'https://img.spoonacular.com/716429.jpg',
          aggregateLikes: 209,
          servings: 2,
          sourceUrl: 'https://example.test/pasta',
          credit: 'Full Belly Sisters',
          ingredients: [{ name: 'garlic', amount: 2, unit: 'cloves', original: '2 cloves garlic' }],
          steps: ['Boil the pasta.', 'Fry garlic.'],
        },
      ]);
    });

    it('drops a hit with no usable id or title rather than pooling a blank card', async () => {
      const { fetchImpl } = spoonacularFetchFake({
        recipes: [
          { id: 1, title: 'Real Dish' },
          { id: 2, title: '' },
        ],
      });
      const client = createSpoonacularClient(fetchImpl, 'test-key');

      const pooled = await client.searchRecipes(craving, { number: 60, offset: 0 });
      expect(pooled.map((recipe) => recipe.placeId)).toEqual(['1']);
      // A Recipe the source knows nothing more about is still cookable-shaped.
      expect(pooled[0]).toMatchObject({ ingredients: [], steps: [] });
    });
  });
});

// The Spoonacular fetch boundary: Convert Amounts and the ingredient lookup
// the quantity ladder's rung 2 gates on (#257). This is the one client every
// Spoonacular call must flow through — the #261 daily-points guard wraps it.
// api.spoonacular.com sits behind Cloudflare, which 403s non-browser user
// agents (#244), so the browser UA is pinned like the Woolworths client's.
import { config } from '../config/index.js';
import { number } from './storefrontResolution.js';

const BASE = 'https://api.spoonacular.com';
const PINNED_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface IngredientInfo {
  /** Rung 2's gate (#244): Convert never refuses, so "the ingredient search
   * finds it" is the only trustworthy signal a conversion is grounded. */
  known: boolean;
  consistency: 'liquid' | 'solid' | null;
}

export interface SpoonacularClient {
  /** Grams for one `sourceUnit` of the ingredient; null when Convert answers
   * without a number. Transport failures throw — the ladder falls through. */
  gramsPerUnit(ingredientName: string, sourceUnit: string): Promise<number | null>;
  ingredientInfo(ingredientName: string): Promise<IngredientInfo>;
}

export function createSpoonacularClient(
  fetchImpl: typeof fetch = fetch,
  apiKey: string | undefined = config.spoonacular.apiKey
): SpoonacularClient {
  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams({ ...params, apiKey: apiKey ?? '' }).toString();
    const response = await fetchImpl(`${BASE}${path}?${query}`, {
      headers: { 'User-Agent': PINNED_UA, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Spoonacular ${path} failed with status ${response.status}`);
    return response.json();
  }

  return {
    async gramsPerUnit(ingredientName, sourceUnit) {
      const body = (await get('/recipes/convert', {
        ingredientName,
        sourceAmount: '1',
        sourceUnit,
        targetUnit: 'grams',
      })) as { targetAmount?: unknown };
      return number(body.targetAmount) ?? null;
    },

    async ingredientInfo(ingredientName) {
      const search = (await get('/food/ingredients/search', {
        query: ingredientName,
        number: '1',
      })) as { results?: Array<{ id?: number }> };
      const id = search.results?.[0]?.id;
      if (id === undefined) return { known: false, consistency: null };
      const info = (await get(`/food/ingredients/${id}/information`, {
        amount: '1',
        unit: 'serving',
      })) as { consistency?: unknown };
      return {
        known: true,
        consistency:
          info.consistency === 'liquid' || info.consistency === 'solid' ? info.consistency : null,
      };
    },
  };
}

// The Spoonacular fetch boundary: Convert Amounts and the ingredient lookup
// the quantity ladder's rung 2 gates on (#257). This is the one client every
// Spoonacular call must flow through — the #261 daily-points guard wraps it.
// api.spoonacular.com sits behind Cloudflare, which 403s non-browser user
// agents (#244), so the browser UA is pinned like the Woolworths client's.
import type { Craving, Recipe } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
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

/** One ingredient of a pooled Recipe, as the source states it. */
export interface PooledIngredient {
  name: string;
  /** The term everything downstream of the card searches on, when `name` is
   * not searchable: an Owned Recipe authors "gluten free vegetable stock" to
   * read right on the card and "vegetable stock" here (#336). Never set by a
   * Sourced Recipe — Spoonacular states one name and it is the only one. */
  searchTerm?: string;
  amount: number;
  unit: string;
  /** The recipe's own wording — an Unmatched line falls back to it (#262). */
  original: string;
}

/**
 * A Recipe as the shared per-Craving pool holds it: the Deck Entry the wire
 * carries (title, image, aggregate likes) plus everything the Shopping List
 * the Top Pick later mints needs (#262). Only the DeckEntry half is ever dealt
 * onto the wire.
 *
 * `servings` is what the amounts below are stated for, and so the denominator
 * of the scale to the Headcount. `sourceName`/`sourceUrl` are snapshotted into
 * the list at mint alongside the steps, for the same reason the steps are:
 * cooking happens days after the pool has aged out, and the credit line is the
 * license obligation attached to showing the method (#247).
 */
export interface PooledRecipe extends Recipe {
  ingredients: PooledIngredient[];
  steps: string[];
  /** Absent when the source didn't say; the mint then scales by nothing. */
  servings?: number;
  sourceName?: string;
  sourceUrl?: string;
}

export interface SpoonacularClient {
  /** Grams for one `sourceUnit` of the ingredient; null when Convert answers
   * without a number. Transport failures throw — the ladder falls through. */
  gramsPerUnit(ingredientName: string, sourceUnit: string): Promise<number | null>;
  ingredientInfo(ingredientName: string): Promise<IngredientInfo>;
  /** One page of the Craving's recipe pool. Transport failures throw. */
  searchRecipes(
    craving: Craving,
    page: { number: number; offset: number }
  ): Promise<PooledRecipe[]>;
}

interface RecipeSearchResult {
  id?: unknown;
  title?: unknown;
  image?: unknown;
  aggregateLikes?: unknown;
  servings?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
  spoonacularSourceUrl?: unknown;
  extendedIngredients?: Array<{
    name?: unknown;
    amount?: unknown;
    unit?: unknown;
    original?: unknown;
  }>;
  analyzedInstructions?: Array<{ steps?: Array<{ step?: unknown }> }>;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

function toPooledRecipe(result: RecipeSearchResult): PooledRecipe | null {
  const id = number(result.id);
  const name = text(result.title);
  if (id === undefined || name === undefined) return null;

  return {
    kind: 'recipe',
    placeId: String(id),
    name,
    photoUrl: text(result.image),
    aggregateLikes: number(result.aggregateLikes),
    servings: number(result.servings),
    sourceName: text(result.sourceName),
    // Spoonacular's own page for the Recipe is the fallback, because this URL
    // is the cook view's degrade path (#265): a Recipe whose steps came through
    // empty shows the credit line *instead of* the method, so a credit with
    // nowhere to go is the one dead end that path exists to prevent.
    sourceUrl: text(result.sourceUrl) ?? text(result.spoonacularSourceUrl),
    ingredients: (result.extendedIngredients ?? []).flatMap((ingredient) => {
      const ingredientName = text(ingredient.name);
      return ingredientName === undefined
        ? []
        : [
            {
              name: ingredientName,
              amount: number(ingredient.amount) ?? 0,
              unit: text(ingredient.unit) ?? '',
              original: text(ingredient.original) ?? ingredientName,
            },
          ];
    }),
    steps: (result.analyzedInstructions ?? []).flatMap((instruction) =>
      (instruction.steps ?? []).flatMap((step) => text(step.step) ?? [])
    ),
  };
}

// --- The daily-points guard (#261) -------------------------------------
// Redis: spoonacular:points:{YYYY-MM-DD}  string, the points the source has
//        reported spent on that UTC quota day, as of its last response.

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
}

/** Two days, so a counter outlives its quota day and nothing else. */
const POINTS_TTL_MS = 48 * 3_600_000;

/**
 * Spoonacular's quota day is the UTC one, and so is the key that counts it:
 * at midnight UTC the date changes, a fresh key reads as zero, and that is
 * the whole rollover — no scheduled reset to get wrong.
 */
export const pointsKey = () => `spoonacular:points:${new Date().toISOString().slice(0, 10)}`;

/**
 * The daily-points guard (#261): the fetch this client is built on, wrapped so
 * every outbound call — pool search and Convert alike — is checked against the
 * configured ceiling before it goes out and feeds the counter after it lands.
 *
 * At the ceiling it throws without calling, deliberately the same shape as a
 * transport failure: at setup the Cook Branch reports the source unavailable
 * and caches nothing (#260), mid-mint the quantity ladder falls through to the
 * next rung and the list still mints (#257). Sessions on a warm pool never
 * reach the client at all, so a dark day leaves them untouched.
 *
 * ponytail: the counter is Spoonacular's own cumulative header rather than a
 * local tally, so it is only as fresh as the last response, and the read and
 * the write around each call are not one atomic step. Two ceilings follow,
 * both undercounts, both self-correcting on the next response, and both an
 * order smaller than the gap the configured ceiling leaves under the tier's
 * 1,500: in-flight calls can overshoot by their own point cost, and
 * concurrent responses landing out of order can write the lower of the two.
 * Upgrade path if that gap ever gets tight: make the write an `eval` that
 * compares against the stored value inside Redis.
 */
export function guardDailyPoints(
  redis: RedisLike,
  fetchImpl: typeof fetch,
  ceiling: number = config.spoonacular.dailyPointCeiling
): typeof fetch {
  return async (input, init) => {
    const key = pointsKey();
    const used = Number(await redis.get(key)) || 0;
    if (used >= ceiling) {
      throw new Error(`Spoonacular daily point ceiling reached (${used}/${ceiling})`);
    }
    const response = await fetchImpl(input, init);
    // A response the source didn't count is still one it charged for. Leaving
    // the counter frozen on a header that stopped arriving is the guard
    // quietly ceasing to guard — the silent bill it exists to prevent — so an
    // uncounted response costs the cheapest a call can be, loudly.
    const reported = Number(response.headers.get('X-API-Quota-Used') ?? NaN);
    if (Number.isNaN(reported)) {
      // The path only — the query string carries the API key.
      logger.warn(
        { used, path: new URL(String(input)).pathname, status: response.status },
        'Spoonacular response carried no quota header'
      );
    }
    const counted = Number.isNaN(reported) ? used + 1 : reported;
    if (counted > used) await redis.set(key, String(counted), 'PX', POINTS_TTL_MS);
    return response;
  };
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

    async searchRecipes(craving, page) {
      const body = (await get('/recipes/complexSearch', {
        type: craving.mealType,
        // Spoonacular ORs a comma-separated cuisine list and ANDs the diets:
        // "italian or thai, and vegetarian" is exactly the chips' meaning.
        ...(craving.cuisines.length > 0 && { cuisine: craving.cuisines.join(',') }),
        ...(craving.diets.length > 0 && { diet: craving.diets.join(',') }),
        instructionsRequired: 'true',
        addRecipeInformation: 'true',
        fillIngredients: 'true',
        number: String(page.number),
        offset: String(page.offset),
      })) as { results?: RecipeSearchResult[] };
      return (body.results ?? []).flatMap((result) => toPooledRecipe(result) ?? []);
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

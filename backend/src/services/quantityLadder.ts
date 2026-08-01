// The quantity ladder (#257): the deterministic module that turns a scaled
// ingredient amount plus a Product Match into a buyable quantity and one of
// the four #234 Ingredient Line states — no per-line model call. The rungs,
// in #241's order: unit-family short-circuit → Spoonacular Convert (gated on
// ingredient-search-known, #244) → 1 g = 1 mL for liquid-consistency
// ingredients → the static vague-unit table → degrade. Convert being
// unreachable (transport failure, or the #261 guard tripping) is not a
// special case: the line falls through the remaining rungs and degrades if
// unresolved — nothing throws, nothing blocks a Shopping List mint.
import type {
  ProductCandidate,
  ProductMatchOutcome,
  QuantityResolution,
} from '@dinder/shared/types';
import { logger } from '../logger.js';
import { cupCentsPerGram, parsePack } from './packParser.js';
import type { IngredientInfo, SpoonacularClient } from './spoonacularClient.js';

export interface IngredientAmount {
  name: string;
  /** Null when the recipe amount was a range or unparseable — degrades (#241). */
  amount: number | null;
  /** Recipe unit; '' for a bare count ("4 chicken breasts"). */
  unit: string;
}

const MASS_G: Record<string, number> = { g: 1, kg: 1000 };
// AU volumetric: tbsp is 20 mL, not the US 15.
const VOL_ML: Record<string, number> = { ml: 1, l: 1000, tbsp: 20, tsp: 5 };
// Recipe units that compare directly against an each/N-pack product ("1
// bunch" against a bunch-sold product divides like any other count).
const COUNT_UNITS = new Set(['', 'packet', 'head', 'loaf', 'punnet', 'bunch']);

// Rung 4: the static vague-unit table, in grams. Per #244 it owns
// bunch/handful/sprig for fresh herbs *unconditionally*, shadowing
// Spoonacular — Convert answers confidently and 10× low for them.
const VAGUE_GRAMS: Record<string, number> = {
  bunch: 60,
  handful: 10,
  sprig: 3,
  sprigs: 3,
  thumb: 25,
  leaves: 0.5,
  pinch: 0.5,
};
const HERB_UNITS = new Set(['bunch', 'handful', 'sprig', 'sprigs', 'leaves']);
const FRESH_HERBS = /coriander|basil|parsley|rosemary|mint|thyme|dill|sage|chive|kaffir/i;
// Per-ingredient override: cloves are a fraction of the each-sold head.
const CLOVES_PER_HEAD = 10;
// A sub-gram answer for a whole line is #244's curry-roux tell: Convert
// answering for something it doesn't actually know.
const SUB_GRAM_TELL = 0.5;

// Convert results never expire (#257) — an ingredient's per-unit weight is
// not a price; the keys have no TTL.
const convertKey = (name: string, unit: string) => `spoonacular:convert:${name}:${unit}`;
const ingredientKey = (name: string) => `spoonacular:ingredient:${name}`;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

interface QuantityLadderDeps {
  redis: RedisLike;
  client: SpoonacularClient;
}

export interface QuantityLadder {
  resolveLine(
    ingredient: IngredientAmount,
    outcome: ProductMatchOutcome
  ): Promise<QuantityResolution>;
}

const ceilPacks = (need: number, per: number) => Math.ceil(need / per - 1e-9);
const unpriced = (reason: string): QuantityResolution => ({ state: 'unpriced_matched', reason });

export function createQuantityLadder(deps: QuantityLadderDeps): QuantityLadder {
  /** Cached call: a definitive answer caches forever; a transport failure
   * returns undefined (unreachable — fall through) and caches nothing. */
  async function cached<T>(key: string, call: () => Promise<T>): Promise<T | undefined> {
    const hit = await deps.redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
    try {
      const answer = await call();
      await deps.redis.set(key, JSON.stringify(answer));
      return answer;
    } catch (error) {
      logger.warn({ err: error, key }, 'Spoonacular unreachable, falling through');
      return undefined;
    }
  }

  const info = (name: string): Promise<IngredientInfo | undefined> =>
    cached(ingredientKey(name), () => deps.client.ingredientInfo(name));

  async function isLiquid(name: string): Promise<boolean> {
    return (await info(name))?.consistency === 'liquid';
  }

  /** Rungs 2–4: (amount, unit) to grams, or null to degrade. */
  async function needGrams(name: string, amount: number, unit: string): Promise<number | null> {
    if (HERB_UNITS.has(unit) && FRESH_HERBS.test(name)) return amount * VAGUE_GRAMS[unit];
    if ((await info(name))?.known) {
      const sourceUnit = { '': 'piece', tbsp: 'tablespoons', tsp: 'teaspoons' }[unit] ?? unit;
      const perUnit = await cached(convertKey(name, sourceUnit), () =>
        deps.client.gramsPerUnit(name, sourceUnit)
      );
      if (typeof perUnit === 'number' && amount * perUnit > SUB_GRAM_TELL) {
        return amount * perUnit;
      }
    }
    if (unit in VOL_ML && (await isLiquid(name))) return amount * VOL_ML[unit];
    if (unit in VAGUE_GRAMS) return amount * VAGUE_GRAMS[unit];
    return null;
  }

  async function resolve(
    ingredient: IngredientAmount,
    candidate: ProductCandidate
  ): Promise<QuantityResolution> {
    if (ingredient.amount === null) return unpriced('ranged or missing amount');
    const { name, amount } = ingredient;
    const unit = ingredient.unit.trim().toLowerCase();
    const pack = parsePack(candidate.packageSize);
    if (pack === null) return unpriced(`unparsed pack "${candidate.packageSize ?? ''}"`);

    if (pack.kind === 'count') {
      let packs: number;
      // The clove override outranks the bare-count rule, or 3 cloves buys 3 bulbs.
      if (/garlic clove/i.test(name)) packs = ceilPacks(amount / CLOVES_PER_HEAD, pack.units);
      else if (COUNT_UNITS.has(unit)) packs = ceilPacks(amount, pack.units);
      else if (unit in VAGUE_GRAMS)
        packs = 1; // a handful/sprigs need: one bunch covers it
      else return unpriced(`${unit || 'count'} vs count pack, no bridge`);
      if (candidate.priceCents === undefined) return unpriced('no price on product');
      return {
        state: 'priced',
        needs: { amount, unit: 'each' },
        packs,
        priceCents: packs * candidate.priceCents,
      };
    }

    if (pack.kind === 'fixed') {
      let need: number;
      if (unit in MASS_G && pack.family === 'mass') need = amount * MASS_G[unit];
      else if (unit in VOL_ML && pack.family === 'volume') need = amount * VOL_ML[unit];
      else {
        const grams = await needGrams(name, amount, unit);
        if (grams === null) return unpriced(`no conversion for "${unit}"`);
        // Grams against a mL pack is only sound for liquids (rung 3's gate).
        if (pack.family === 'volume' && !(await isLiquid(name))) {
          return unpriced('grams vs volume pack, not liquid');
        }
        need = grams;
      }
      if (candidate.priceCents === undefined) return unpriced('no price on product');
      const packs = ceilPacks(need, pack.quantity);
      return {
        state: 'priced',
        needs: { amount: Math.round(need), unit: pack.family === 'mass' ? 'g' : 'mL' },
        packs,
        priceCents: packs * candidate.priceCents,
      };
    }

    // Variable-weight packs price as Estimated: unit price × needed mass
    // (#241). Range packs ("750g - 2.2kg") take the same path — #245's
    // cheap win; all three gate corpus range lines carry cup unit prices.
    const centsPerGram = cupCentsPerGram(candidate.cupString);
    if (centsPerGram === null) return unpriced(`${pack.kind} pack, no unit price`);
    const grams = unit in MASS_G ? amount * MASS_G[unit] : await needGrams(name, amount, unit);
    if (grams === null) return unpriced(`${pack.kind} pack, no conversion for "${unit}"`);
    return {
      state: 'estimated',
      needs: { amount: Math.round(grams), unit: 'g' },
      priceCents: Math.round(grams * centsPerGram),
    };
  }

  return {
    async resolveLine(ingredient, outcome) {
      // A clean miss and a failed search land the same way for the line:
      // Unmatched — recipe text plus a Retailer search link, still claimable.
      if (outcome.status !== 'matched') return { state: 'unmatched' };
      try {
        return await resolve(ingredient, outcome.match);
      } catch (error) {
        // Belt over braces: a mint never fails because a line couldn't resolve.
        logger.warn({ err: error, ingredient: ingredient.name }, 'quantity ladder threw');
        return unpriced('resolution failed');
      }
    },
  };
}

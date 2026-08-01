// Pool-and-deal, the Cook Branch's recipe supply (#232, #259): one shared pool
// of ~60 Recipes per canonical Craving in Redis, dealt as a random ~15-card
// Deck per Session. Two Sessions craving the same thing tonight cost one
// Spoonacular lookup between them.
//
// The pool holds whole Recipes — ingredients and steps aboard — because the
// Shopping List is minted from the crowned one later (#262). Only the Deck
// Entry half is ever dealt onto the wire.
import type { Craving, Recipe } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { PooledRecipe, SpoonacularClient } from './spoonacularClient.js';

// --- Keyspace ----------------------------------------------------------
// recipes:pool:{craving}    string: the pooled Recipes, JSON, TTL from config
// recipes:offset:{craving}  string: how many times this pool has been refreshed

/**
 * The canonical Craving, and with it the shared pool key. Sorting the sets and
 * lowercasing makes "italian + thai" and "Thai + Italian" one Craving, which is
 * what lets two Sessions share a pool. Headcount is deliberately absent — it
 * scales servings, it never filters the Deck (CONTEXT.md).
 */
export function cravingPoolKey(craving: Craving): string {
  const set = (values: readonly string[]) =>
    [...values]
      .map((value) => value.trim().toLowerCase())
      .sort()
      .join(',');
  return `recipes:pool:${craving.mealType.trim().toLowerCase()}|${set(craving.cuisines)}|${set(craving.diets)}`;
}

const offsetKey = (poolKey: string) => poolKey.replace('recipes:pool:', 'recipes:offset:');

/**
 * Spoonacular refuses an offset past 900 on the Cook tier. Wrapping keeps a
 * long-lived Craving cycling through the same catalogue instead of paging off
 * the end into an empty pool.
 * ponytail: a fixed wrap, not a seen-set — cross-Session repeats are accepted
 * (#246). Upgrade path if repeats ever grate: remember dealt ids per Craving.
 */
const MAX_OFFSET = 900;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<unknown>;
}

interface RecipePoolServiceDeps {
  redis: RedisLike;
  client: SpoonacularClient;
  /** 24 h by default, shortenable to the compliant 1 h with a redeploy (#237). */
  poolTtlMs?: number;
  poolSize?: number;
  deckSize?: number;
  /** Injected so tests can deal deterministically. */
  shuffle?: <T>(entries: T[]) => T[];
}

export interface RecipePoolService {
  /** A Session's Deck: min(pool, deckSize) Recipes, randomly cut from the pool. */
  dealDeck(craving: Craving): Promise<Recipe[]>;
}

/** Fisher-Yates over a copy — the caller's pool is never reordered. */
function shuffleInPlace<T>(entries: T[]): T[] {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** The Deck Entry half: what a Participant swipes, and all the wire carries. */
function toDeckEntry(recipe: PooledRecipe): Recipe {
  return {
    kind: 'recipe',
    placeId: recipe.placeId,
    name: recipe.name,
    photoUrl: recipe.photoUrl,
    aggregateLikes: recipe.aggregateLikes,
  };
}

export function createRecipePoolService(deps: RecipePoolServiceDeps): RecipePoolService {
  const poolTtlMs = deps.poolTtlMs ?? config.spoonacular.poolTtlMs;
  const poolSize = deps.poolSize ?? config.spoonacular.poolSize;
  const deckSize = deps.deckSize ?? config.spoonacular.deckSize;
  const shuffle = deps.shuffle ?? shuffleInPlace;

  /** Where the next refresh of this Craving starts in the source catalogue. */
  async function nextOffset(key: string): Promise<number> {
    const refreshes = await deps.redis.incr(offsetKey(key));
    // The counter outlives its pool so a re-pooled Craving moves on rather than
    // re-dealing the same page; it ages out with a refresh of its own.
    await deps.redis.pexpire(offsetKey(key), poolTtlMs);
    return ((refreshes - 1) * poolSize) % MAX_OFFSET;
  }

  async function readPool(key: string): Promise<PooledRecipe[] | null> {
    const raw = await deps.redis.get(key);
    return raw ? (JSON.parse(raw) as PooledRecipe[]) : null;
  }

  return {
    async dealDeck(craving: Craving): Promise<Recipe[]> {
      const key = cravingPoolKey(craving);
      let pool = await readPool(key);

      if (!pool) {
        const offset = await nextOffset(key);
        pool = await deps.client.searchRecipes(craving, { number: poolSize, offset });
        await deps.redis.set(key, JSON.stringify(pool), 'PX', poolTtlMs);
        logger.info({ poolKey: key, offset, pooledCount: pool.length }, 'Recipe pool filled');
      }

      // min(pool, deckSize), no floor and no thinness warning: a niche Craving
      // deals a smaller Deck rather than erroring (#246). Zero is #260's.
      return shuffle(pool).slice(0, deckSize).map(toDeckEntry);
    },
  };
}

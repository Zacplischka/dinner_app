// Pool-and-deal, the Cook Branch's recipe supply (#232, #259): one shared pool
// of ~60 Recipes per canonical Craving in Redis, dealt as a random ~15-card
// Deck per Session. Two Sessions craving the same thing tonight cost one
// Spoonacular lookup between them.
//
// The pool holds whole Recipes — ingredients and steps aboard — because the
// Shopping List is minted from the crowned one later (#262). Only the Deck
// Entry half is ever dealt onto the wire.
import type { Craving, DeckEntry, Recipe } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { OWNED_PREFIX, filterByCraving, readOwnedRecipe } from './ownedRecipeStore.js';
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
 * Prototype (#316): the Craving back out of its pool key, so redeal — which
 * only carries the key — can ask the owned store the same question dealDeck
 * did. The key was minted from a canonicalized Craving, so the round-trip is
 * lossless; the casts just re-assert the union types the key lowercased.
 */
function cravingFromPoolKey(poolKey: string): Craving {
  const [mealType, cuisines, diets] = poolKey.replace('recipes:pool:', '').split('|');
  return {
    mealType,
    cuisines: cuisines ? cuisines.split(',') : [],
    diets: diets ? diets.split(',') : [],
  } as Craving;
}

/** Floor of 3 owned in a Deck (#316): min(3, owned) owned + vendor fill, then
 * topped back up with more owned when the vendor side can't fill the Deck. */
function unionTakes(ownedCount: number, vendorCount: number, deckSize: number) {
  const ownedFloor = Math.min(3, ownedCount);
  const vendorTake = Math.min(vendorCount, deckSize - ownedFloor);
  const ownedTake = Math.min(ownedCount, deckSize - vendorTake);
  return { ownedTake, vendorTake };
}

/**
 * Spoonacular refuses an offset past 900 on the Cook tier. Wrapping keeps a
 * long-lived Craving cycling through the same catalogue instead of paging off
 * the end into an empty pool.
 * ponytail: a fixed wrap, not a seen-set — cross-Session repeats are accepted
 * (#246). Upgrade path if repeats ever grate: remember dealt ids per Craving.
 */
const MAX_OFFSET = 900;

/** How much longer the offset counter lives than the pool it rotates. */
const OFFSET_TTL_MULTIPLE = 4;

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
  /** How long a Craving that matched nothing stays a clean miss (#260). */
  emptyPoolTtlMs?: number;
  poolSize?: number;
  deckSize?: number;
  /** Injected so tests can deal deterministically. */
  shuffle?: <T>(entries: T[]) => T[];
}

export interface RecipePoolService {
  /** A Session's Deck: min(pool, deckSize) Recipes, randomly cut from the pool. */
  dealDeck(craving: Craving): Promise<Recipe[]>;
  /**
   * A Restart's Deck (#246, #260): a fresh cut of the pool `current` was dealt
   * from, fresh Recipes first and topped up with repeats when the pool is thin,
   * so Restart means "show me different ones" and never means "no". A pool that
   * has aged out degrades to reshuffling `current` rather than paying a lookup
   * — Restart is not a moment to go to the network, and never fails.
   *
   * Restaurant Restart never comes here: restaurant supply is geography-bound
   * and recipe supply is not, which is the whole reason for the divergence.
   */
  redeal(poolKey: string, current: DeckEntry[]): Promise<DeckEntry[]>;
  /**
   * The whole pooled Recipe behind a dealt card — ingredients, steps, servings,
   * credit — which is what the Shopping List is minted from (#262). Null once
   * the pool has aged out; the mint degrades rather than paying a lookup.
   */
  readRecipe(poolKey: string, placeId: string): Promise<PooledRecipe | null>;
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
  const emptyPoolTtlMs = deps.emptyPoolTtlMs ?? config.spoonacular.emptyPoolTtlMs;
  const poolSize = deps.poolSize ?? config.spoonacular.poolSize;
  const deckSize = deps.deckSize ?? config.spoonacular.deckSize;
  const shuffle = deps.shuffle ?? shuffleInPlace;

  /** Where the next refresh of this Craving starts in the source catalogue. */
  async function nextOffset(key: string): Promise<number> {
    const refreshes = await deps.redis.incr(offsetKey(key));
    // The counter must outlive the pool it rotates, or it dies first and every
    // refresh re-requests offset 0 — the rotation silently never happens. Its
    // own TTL is therefore a multiple of the pool's, and is restamped here on
    // each refresh; a Craving nobody wants for that long forgets its place,
    // which costs one repeated page.
    await deps.redis.pexpire(offsetKey(key), poolTtlMs * OFFSET_TTL_MULTIPLE);
    return ((refreshes - 1) * poolSize) % MAX_OFFSET;
  }

  async function readPool(key: string): Promise<PooledRecipe[] | null> {
    const raw = await deps.redis.get(key);
    return raw ? (JSON.parse(raw) as PooledRecipe[]) : null;
  }

  return {
    async dealDeck(craving: Craving): Promise<Recipe[]> {
      const key = cravingPoolKey(craving);
      const owned = filterByCraving(craving);
      // An empty pool is a cached answer, not a cache miss: `null` means the
      // Craving has never been looked up (or has aged out), `[]` means the
      // catalogue was asked and had nothing. Only the first re-fetches.
      let pool = await readPool(key);

      if (!pool) {
        try {
          // ponytail: read-then-fill, no lock. Two Sessions starting the same
          // cold Craving in the same instant both fetch, both burn a lookup and
          // an offset step, and the later SET wins — nobody sees a failure and
          // both get a full Deck. Upgrade path if Cook traffic ever makes that
          // bite: SETNX a short-lived fill marker and have the loser re-read.
          let offset = await nextOffset(key);
          // A throw here writes nothing: a transport failure must never be
          // remembered as "this Craving has no Recipes" (#260). The clean miss
          // is cached, and briefly, because it is an answer about the catalogue.
          pool = await deps.client.searchRecipes(craving, { number: poolSize, offset });

          if (pool.length === 0 && offset > 0) {
            // Not a clean miss — the rotation has simply paged off the end of a
            // Craving smaller than the offset it has climbed to. Caching that as
            // "nothing matches" would refuse a Craving that has Recipes, and #250
            // is explicit that a wrong empty answer must not kill a Craving.
            // ponytail: ask from the top rather than track each Craving's size.
            // Ceiling: one wasted lookup per refresh of a lapped Craving — about
            // one a day. Upgrade path: pool `totalResults` and cap the offset.
            offset = 0;
            pool = await deps.client.searchRecipes(craving, { number: poolSize, offset });
          }

          const ttlMs = pool.length > 0 ? poolTtlMs : emptyPoolTtlMs;
          await deps.redis.set(key, JSON.stringify(pool), 'PX', ttlMs);
          logger.info(
            { poolKey: key, offset, pooledCount: pool.length, ttlMs },
            'Recipe pool filled'
          );
        } catch (error) {
          // #316: the vendor fetch is best-effort once the owned corpus can
          // carry the deal. Nothing is written to Redis — a transport failure
          // must never be remembered as an answer about the catalogue.
          if (owned.length === 0) throw error;
          logger.warn({ poolKey: key, error }, 'Vendor pool fetch failed; dealing owned only');
          pool = [];
        }
      }

      // Union deal (#316): floor of owned held, no reserved positions — the
      // final Deck is shuffled as one. Zero union deals nothing, and the
      // caller turns that into the one refusal there is — inline at setup.
      const { ownedTake, vendorTake } = unionTakes(owned.length, pool.length, deckSize);
      return shuffle([
        ...shuffle(owned).slice(0, ownedTake),
        ...shuffle(pool).slice(0, vendorTake),
      ]).map(toDeckEntry);
    },

    async redeal(poolKey: string, current: DeckEntry[]): Promise<DeckEntry[]> {
      const pool = await readPool(poolKey);
      const owned = filterByCraving(cravingFromPoolKey(poolKey)).map(toDeckEntry);
      // A vendor pool that has aged out (or cached empty) degrades to the
      // vendor half of `current` — Restart is not a moment to go to the
      // network, and never fails (#246).
      const vendor: DeckEntry[] =
        pool && pool.length > 0
          ? pool.map(toDeckEntry)
          : current.filter((entry) => !entry.placeId.startsWith(OWNED_PREFIX));
      if (owned.length === 0 && vendor.length === 0) return shuffle(current);

      // Per source: unseen first, topped up with repeats when the source is
      // thin — Restart means "show me different ones" and never means "no".
      const wiped = new Set(current.map((entry) => entry.placeId));
      const unseenFirst = (entries: DeckEntry[]): DeckEntry[] => {
        const fresh = entries.filter((entry) => !wiped.has(entry.placeId));
        const repeats = entries.filter((entry) => wiped.has(entry.placeId));
        return [...shuffle(fresh), ...shuffle(repeats)];
      };
      const ownedOrdered = unseenFirst(owned);
      const vendorOrdered = unseenFirst(vendor);
      // The same owned floor as the deal (#316), held on every Restart.
      const { ownedTake, vendorTake } = unionTakes(
        ownedOrdered.length,
        vendorOrdered.length,
        deckSize
      );
      return shuffle([...ownedOrdered.slice(0, ownedTake), ...vendorOrdered.slice(0, vendorTake)]);
    },

    async readRecipe(poolKey: string, placeId: string): Promise<PooledRecipe | null> {
      // Owned Recipes live in memory, not the pool, and never expire (#316).
      if (placeId.startsWith(OWNED_PREFIX)) return readOwnedRecipe(placeId);
      const pool = await readPool(poolKey);
      return pool?.find((recipe) => recipe.placeId === placeId) ?? null;
    },
  };
}

// Pool-and-deal, the Cook Branch's recipe supply (#232, #259): one shared pool
// of ~60 Recipes per canonical Craving in Redis, dealt as a random ~15-card
// Deck per Session. Two Sessions craving the same thing tonight cost one
// Spoonacular lookup between them.
//
// The pool holds whole Recipes — ingredients and steps aboard — because the
// Shopping List is minted from the crowned one later (#262). Only the Deck
// Entry half is ever dealt onto the wire.
//
// Two seams, deliberately apart (#327): `sourcedSupply` gets the Sourced
// supply for a Craving — Redis, the vendor, and every failure semantic it
// carries — and `cutDeck` cuts a Deck from a supply, pure and knowing nothing
// about where the supply came from. The Owned Recipe Store blends a second
// supply into the same cut (#331), the vendor fetch becomes best-effort
// behind the first (#333), and neither has to reach through the other.
//
// The blend is a deal-time union (#316): the Redis pool stays purely Sourced,
// and the two supplies meet only in `blendDeck`. Nothing downstream of the
// cut knows which source a card came from — Deck, Selection and Top Pick all
// see Recipes.
import type { Craving, Cuisine, DeckEntry, Diet, MealType, Recipe } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { OwnedRecipeStore } from './ownedRecipeStore.js';
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

/**
 * The Craving a pool key was built from. The Restart path carries the key
 * rather than the Craving, and the corpus filters on the Craving — so the
 * canonicalization is read back out rather than the Craving stored twice.
 * Lossless by construction: the key holds the same three fields, trimmed,
 * lowercased and sorted, and the chip vocabularies are lowercase already.
 */
export function cravingFromPoolKey(poolKey: string): Craving {
  const [mealType, cuisines, diets] = poolKey.slice('recipes:pool:'.length).split('|');
  const set = (values: string) => (values === '' ? [] : values.split(','));
  return {
    mealType: mealType as MealType,
    cuisines: set(cuisines) as Cuisine[],
    diets: set(diets) as Diet[],
  };
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

/** How much longer the offset counter lives than the pool it rotates. */
const OFFSET_TTL_MULTIPLE = 4;

/**
 * The floor: 3 Owned Recipes in a Deck of 15 (#316). Enough that the corpus
 * carries a Craving the vendor is thin on, few enough that a Deck still reads
 * as the catalogue's.
 */
const OWNED_FLOOR = 3;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<unknown>;
}

interface RecipePoolServiceDeps {
  redis: RedisLike;
  client: SpoonacularClient;
  /** The second supply: Dinder's own Recipes, in memory (ADR 0011). */
  owned: OwnedRecipeStore;
  /** 24 h by default, shortenable to the compliant 1 h with a redeploy (#237). */
  poolTtlMs?: number;
  /** How long a Craving that matched nothing stays a clean miss (#260). */
  emptyPoolTtlMs?: number;
  poolSize?: number;
  deckSize?: number;
  /** How many Owned Recipes a full Deck holds at least (#316). */
  ownedFloor?: number;
  /** Injected so tests can deal deterministically. */
  shuffle?: <T>(entries: T[]) => T[];
}

export interface RecipePoolService {
  /**
   * The Sourced supply for a Craving: the shared Redis pool, filled from the
   * vendor when it is cold. Whole pooled Recipes, not a Deck — the cut is
   * `cutDeck`'s job. Transport failures throw and write nothing.
   */
  sourcedSupply(craving: Craving): Promise<PooledRecipe[]>;
  /** A Session's Deck: min(pool, deckSize) Recipes, randomly cut from the pool. */
  dealDeck(craving: Craving): Promise<Recipe[]>;
  /**
   * A Restart's Deck (#246, #260): a fresh cut of the pool `current` was dealt
   * from. A pool that has aged out degrades to reshuffling `current` rather
   * than paying a lookup — Restart is not a moment to go to the network, and
   * never fails.
   *
   * Restaurant Restart never comes here: restaurant supply is geography-bound
   * and recipe supply is not, which is the whole reason for the divergence.
   */
  redeal(poolKey: string, current: DeckEntry[]): Promise<DeckEntry[]>;
  /**
   * The whole Recipe behind a dealt card — ingredients, steps, servings,
   * credit — which is what the Shopping List is minted from (#262). Both
   * supplies answer: the corpus for an `owned:` card, the pool for a Sourced
   * one. Null once a *Sourced* Recipe's pool has aged out; the mint degrades
   * rather than paying a lookup. An Owned Recipe never ages out.
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

/**
 * A Deck cut from a supply: min(supply, `size`) Recipes, Deck Entry half only,
 * cards `current` has not already shown leading the ones it has. A first deal
 * passes an empty `current` and is simply the random cut; a Restart passes the wiped
 * Deck and gets the #260 rule — fresh first, topped up with repeats when the
 * supply is thin, so Restart means "show me different ones" and never "no".
 *
 * No floor and no thinness warning: a niche Craving cuts a smaller Deck rather
 * than erroring. An empty supply cuts nothing, and the caller turns that into
 * the one refusal there is — inline at setup.
 *
 * Pure, and per-supply by construction: a blend cuts each source and merges
 * the cuts, it never cuts a merged pile (#331).
 */
export function cutDeck(
  supply: readonly PooledRecipe[],
  size: number,
  current: readonly DeckEntry[],
  shuffle: <T>(entries: T[]) => T[]
): Recipe[] {
  const wiped = new Set(current.map((entry) => entry.placeId));
  const fresh = supply.filter((recipe) => !wiped.has(recipe.placeId));
  const repeats = supply.filter((recipe) => wiped.has(recipe.placeId));
  return [...shuffle(fresh), ...shuffle(repeats)].slice(0, size).map(toDeckEntry);
}

/**
 * The blend (#316): one Deck cut from two supplies. Owned holds a floor of
 * `floor` cards and takes whatever more the Deck needs when the Sourced supply
 * is thin, so a thin Craving still deals a full Deck.
 *
 * Each supply is cut on its own before the two are shuffled together, which is
 * what makes the floor survive a Restart: fresh-first is computed within each
 * source, so owned's own unshown cards lead its cut instead of losing the
 * floor to the far larger pile of unshown Sourced Recipes a merged cut would
 * reach for. The final shuffle is the whole disguise — no reserved positions,
 * nothing labelling a card, and both cuts are Deck Entries by then.
 */
export function blendDeck(
  owned: readonly PooledRecipe[],
  sourced: readonly PooledRecipe[],
  size: number,
  floor: number,
  current: readonly DeckEntry[],
  shuffle: <T>(entries: T[]) => T[]
): Recipe[] {
  // cutDeck already deals only what a supply holds, so a corpus thinner than
  // the floor deals what it has rather than the Deck coming out short.
  const ownedCut = cutDeck(owned, Math.max(floor, size - sourced.length), current, shuffle);
  return shuffle([...ownedCut, ...cutDeck(sourced, size - ownedCut.length, current, shuffle)]);
}

export function createRecipePoolService(deps: RecipePoolServiceDeps): RecipePoolService {
  const poolTtlMs = deps.poolTtlMs ?? config.spoonacular.poolTtlMs;
  const emptyPoolTtlMs = deps.emptyPoolTtlMs ?? config.spoonacular.emptyPoolTtlMs;
  const poolSize = deps.poolSize ?? config.spoonacular.poolSize;
  const deckSize = deps.deckSize ?? config.spoonacular.deckSize;
  const ownedFloor = deps.ownedFloor ?? OWNED_FLOOR;
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

  /** The pool a Craving deals from, filled from the source when it is cold. */
  async function sourcedSupply(craving: Craving): Promise<PooledRecipe[]> {
    const key = cravingPoolKey(craving);
    // An empty pool is a cached answer, not a cache miss: `null` means the
    // Craving has never been looked up (or has aged out), `[]` means the
    // catalogue was asked and had nothing. Only the first re-fetches.
    const pooled = await readPool(key);
    if (pooled) return pooled;

    // ponytail: read-then-fill, no lock. Two Sessions starting the same
    // cold Craving in the same instant both fetch, both burn a lookup and
    // an offset step, and the later SET wins — nobody sees a failure and
    // both get a full Deck. Upgrade path if Cook traffic ever makes that
    // bite: SETNX a short-lived fill marker and have the loser re-read.
    let offset = await nextOffset(key);
    // A throw here writes nothing: a transport failure must never be
    // remembered as "this Craving has no Recipes" (#260). The clean miss
    // is cached, and briefly, because it is an answer about the catalogue.
    let pool = await deps.client.searchRecipes(craving, { number: poolSize, offset });

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
    logger.info({ poolKey: key, offset, pooledCount: pool.length, ttlMs }, 'Recipe pool filled');
    return pool;
  }

  return {
    sourcedSupply,

    async dealDeck(craving: Craving): Promise<Recipe[]> {
      const owned = deps.owned.forCraving(craving);
      return blendDeck(owned, await sourcedSupply(craving), deckSize, ownedFloor, [], shuffle);
    },

    async redeal(poolKey: string, current: DeckEntry[]): Promise<DeckEntry[]> {
      const pool = await readPool(poolKey);
      // `null` and `[]` part company here, the same way they do in
      // `sourcedSupply`. An aged-out pool (`null`) has nothing left to name
      // the Sourced cards the Deck was dealt, so the wiped Deck is the supply:
      // reshuffling it keeps the Deck's size and its floor, which cutting
      // owned alone would not. A cached clean miss (`[]`) is an answer — the
      // corpus is the whole supply and always was, so the Restart blends
      // against it and deals its unshown cards first.
      if (!pool) return shuffle(current);
      const owned = deps.owned.forCraving(cravingFromPoolKey(poolKey));
      const dealt = blendDeck(owned, pool, deckSize, ownedFloor, current, shuffle);
      // Only reachable when a redeploy takes the corpus out from under a live
      // Session that was dealt owned-only: a Restart never returns no Deck.
      return dealt.length > 0 ? dealt : shuffle(current);
    },

    async readRecipe(poolKey: string, placeId: string): Promise<PooledRecipe | null> {
      // The corpus first: an Owned Recipe is dealt from memory and never
      // written to the pool, so the Shopping List its crown mints has to come
      // back from where the card did — and that copy never ages out.
      const owned = deps.owned.byPlaceId(placeId);
      if (owned) return owned;
      const pool = await readPool(poolKey);
      return pool?.find((recipe) => recipe.placeId === placeId) ?? null;
    },
  };
}

// The Shopping List (#262): minted once from a completed Cook Session's Top
// Pick, and read from its own URL ever after. Every Ingredient Line is scaled
// to the frozen Headcount, run through the Product Matcher (#256) and the
// quantity ladder (#257) into one of #234's four states, and written down —
// prices included. Nothing here re-prices: a read is a read (#239).
//
// The list lives on its own Redis key with a fixed 7-day TTL that nothing
// extends, deliberately independent of the Session that spawned it (ADR 0001).
import { randomUUID } from 'node:crypto';
import type {
  ProductCandidate,
  ProductMatchOutcome,
  QuantityResolution,
  ShoppingList,
  ShoppingListLine,
  ShoppingListProduct,
} from '@dinder/shared/types';
import { logger } from '../logger.js';
import type { Session } from '../store/sessionStore.js';
import type { IngredientAmount } from './quantityLadder.js';
import type { PooledIngredient, PooledRecipe } from './spoonacularClient.js';
import { isStaple } from './staples.js';
import { translateTerm } from './usToAuTerms.js';

/**
 * Seven days from mint, and nothing extends it — not a read, not a Claim, not
 * the Session outliving or predeceasing the list (#229). The URL is the whole
 * capability, so the lifetime has to be honest rather than rescuable.
 */
export const SHOPPING_LIST_TTL_MS = 7 * 24 * 3_600_000;

// --- Keyspace ----------------------------------------------------------
// shoppinglist:{listId}  string: the whole minted list, JSON, PX 7 days

const listKey = (listId: string) => `shoppinglist:${listId}`;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
}

interface ShoppingListServiceDeps {
  redis: RedisLike;
  readSession: (sessionCode: string) => Promise<Session | null>;
  /** Mint-once, atomically: returns whichever id actually won the claim. */
  claimShoppingListId: (sessionCode: string, listId: string) => Promise<string>;
  /** The crowned Recipe, whole — ingredients, steps, servings, credit. */
  readRecipe: (poolKey: string, placeId: string) => Promise<PooledRecipe | null>;
  matchProduct: (term: string) => Promise<ProductMatchOutcome>;
  resolveLine: (
    ingredient: IngredientAmount,
    outcome: ProductMatchOutcome
  ) => Promise<QuantityResolution>;
  /** Injected so tests can name the list they are about to read. */
  newListId?: () => string;
  ttlMs?: number;
  now?: () => number;
}

export interface ShoppingListService {
  /**
   * Mints the list for a Session's crowned Recipe and returns its id, or
   * undefined when there is nothing to mint. The id is returned immediately —
   * pricing continues in the background, because the politeness budget (one
   * Woolworths call at a time, 500 ms apart) makes a full mint tens of seconds
   * and the Match must not wait on it. `readList` waits instead.
   */
  mint(sessionCode: string, placeId: string): Promise<string | undefined>;
  /** The minted list, or null. Waits out an in-flight mint of the same list. */
  readList(listId: string): Promise<ShoppingList | null>;
}

const toProduct = (candidate: ProductCandidate): ShoppingListProduct => ({
  stockcode: candidate.stockcode,
  name: candidate.name,
  packageSize: candidate.packageSize,
});

/**
 * The Ingredient Line's recipe text at its scaled amount — "250 g chicken
 * thigh", "2 garlic clove". An amount the source never stated leaves the line
 * as the ingredient alone rather than inventing a quantity for it.
 */
export function lineText(amount: number, unit: string, name: string): string {
  if (!(amount > 0)) return name;
  const shown = Number(amount.toFixed(2));
  return unit ? `${shown} ${unit} ${name}` : `${shown} ${name}`;
}

export function createShoppingListService(deps: ShoppingListServiceDeps): ShoppingListService {
  const newListId = deps.newListId ?? randomUUID;
  const ttlMs = deps.ttlMs ?? SHOPPING_LIST_TTL_MS;
  const now = deps.now ?? Date.now;
  // Mints in flight, so a Shopper who opens the URL while it is still being
  // priced waits for the answer instead of seeing a 404 that is about to be
  // wrong. Redis stays the source of truth — this only holds the wait.
  const building = new Map<string, Promise<unknown>>();

  async function fromRedis(listId: string): Promise<ShoppingList | null> {
    const raw = await deps.redis.get(listKey(listId));
    return raw ? (JSON.parse(raw) as ShoppingList) : null;
  }

  async function buildLine(
    index: number,
    ingredient: PooledIngredient,
    factor: number
  ): Promise<ShoppingListLine> {
    const scaled = ingredient.amount * factor;
    const line = {
      id: String(index),
      text: lineText(scaled, ingredient.unit, ingredient.name),
      staple: isStaple(ingredient.name),
    };
    // The Retailer search is what an Unmatched line offers instead of a product,
    // so it asks in the local dialect the Matcher would have used (#241).
    const searchTerm = translateTerm(ingredient.name);

    // A Staple is assumed already at home and counted by nothing, so it never
    // costs a Retailer lookup — it renders as its own text, still shoppable.
    if (line.staple) return { ...line, state: 'unmatched', searchTerm };

    const outcome = await deps.matchProduct(ingredient.name);
    const resolution = await deps.resolveLine(
      // A zero or missing amount is not a quantity, and the ladder is explicit
      // that null degrades rather than pricing a line nobody can shop.
      { name: ingredient.name, amount: scaled > 0 ? scaled : null, unit: ingredient.unit },
      outcome
    );
    if (resolution.state === 'unmatched' || outcome.status !== 'matched') {
      return { ...line, state: 'unmatched', searchTerm };
    }

    const product = toProduct(outcome.match);
    if (resolution.state === 'priced') {
      return {
        ...line,
        state: 'priced',
        needs: resolution.needs,
        packs: resolution.packs,
        priceCents: resolution.priceCents,
        product,
      };
    }
    if (resolution.state === 'estimated') {
      return {
        ...line,
        state: 'estimated',
        needs: resolution.needs,
        priceCents: resolution.priceCents,
        product,
      };
    }
    return { ...line, state: 'unpriced_matched', product };
  }

  async function build(
    listId: string,
    headcount: number,
    recipe: PooledRecipe
  ): Promise<ShoppingList> {
    // The amounts are stated for the source's own servings; the Headcount is
    // what they are wanted for. A source that never said scales by nothing —
    // guessing a divisor would silently mis-buy the whole list.
    const factor = recipe.servings && recipe.servings > 0 ? headcount / recipe.servings : 1;

    // Sequential on purpose: every cold Retailer lookup queues behind the same
    // global politeness queue anyway, so firing them together buys no time and
    // costs the clarity of a plain loop.
    const lines: ShoppingListLine[] = [];
    for (const [index, ingredient] of recipe.ingredients.entries()) {
      lines.push(await buildLine(index, ingredient, factor));
    }

    const list: ShoppingList = {
      listId,
      recipeName: recipe.name,
      headcount,
      lines,
      // Snapshotted, because cooking happens days after the pool has aged out
      // and the source may have forgotten the recipe entirely (#247).
      steps: recipe.steps,
      sourceName: recipe.sourceName,
      sourceUrl: recipe.sourceUrl,
      mintedAt: new Date(now()).toISOString(),
    };
    await deps.redis.set(listKey(listId), JSON.stringify(list), 'PX', ttlMs);
    logger.info({ listId, headcount, lineCount: lines.length }, 'Shopping List minted');
    return list;
  }

  return {
    async mint(sessionCode: string, placeId: string): Promise<string | undefined> {
      const session = await deps.readSession(sessionCode);
      if (!session?.cravingKey || session.headcount === undefined) return undefined;

      const recipe = await deps.readRecipe(session.cravingKey, placeId);
      if (!recipe) {
        // ponytail: the shared pool is the only copy of a dealt Recipe's
        // ingredients, and a Session (30 min) can outlive the pool it dealt
        // from (24 h) by minutes. Ceiling: that Session ends at its Top Pick
        // with no list. Upgrade path: stash the dealt Recipes whole beside the
        // Deck at deal time, which costs every Session what this costs ~1%.
        logger.warn({ sessionCode, placeId }, 'Crowned Recipe gone from its pool, no list minted');
        return undefined;
      }

      const candidate = newListId();
      const listId = await deps.claimShoppingListId(sessionCode, candidate);
      // Someone else's completion already minted for this Session: the list is
      // frozen, so the answer is that URL — never a second pricing pass.
      if (listId !== candidate) return listId;

      const minting = build(listId, session.headcount, recipe)
        .catch((error: unknown) => {
          // A mint that fails leaves no key, so the URL 404s and says so —
          // better than a half-priced list nobody can tell is half-priced.
          logger.error({ err: error, sessionCode, listId }, 'Shopping List mint failed');
        })
        .finally(() => building.delete(listId));
      building.set(listId, minting);

      return listId;
    },

    async readList(listId: string): Promise<ShoppingList | null> {
      const minted = await fromRedis(listId);
      if (minted) return minted;
      await building.get(listId);
      return fromRedis(listId);
    },
  };
}

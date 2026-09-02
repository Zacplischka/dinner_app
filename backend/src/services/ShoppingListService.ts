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
  ShoppingListLineState,
  ShoppingListProduct,
} from '@dinder/shared/types';
import { logger } from '../logger.js';
import type { Session } from '../store/sessionStore.js';
import type { IngredientAmount } from './quantityLadder.js';
import type { PooledIngredient, PooledRecipe } from './spoonacularClient.js';
import { isStaple } from './staples.js';
import { deriveSearchTerm, sanitiseIngredientName } from './usToAuTerms.js';

/**
 * Seven days from mint, and nothing extends it — not a read, not a Claim, not
 * the Session outliving or predeceasing the list (#229). The URL is the whole
 * capability, so the lifetime has to be honest rather than rescuable.
 */
export const SHOPPING_LIST_TTL_MS = 7 * 24 * 3_600_000;

/**
 * How long an id may stand claimed but unwritten (#274). Long enough for the
 * slowest plausible mint behind the 500 ms politeness floor, short enough that
 * a mint the process never finished — a deploy restart, an OOM — stops being
 * the Session's answer.
 * ponytail: one fixed span, not a heartbeat the minter keeps refreshing.
 * Ceiling: a mint slower than this loses its marker while still running, so a
 * reader gives up early and a second completion may re-price. Upgrade path:
 * re-set the marker from build()'s loop if real mints ever approach it.
 */
const MINTING_TTL_MS = 120_000;

/** How often a waiting reader asks Redis whether the mint has landed. */
const DEFAULT_POLL_MS = 250;

// --- Keyspace ----------------------------------------------------------
// shoppinglist:{listId}         string: StoredList, JSON, PX 7 days
//                               — or MINTING while it is being priced, PX 2 min
// shoppinglist:{listId}:claims  hash: lineId -> Shopper display name, PXAT the
//                               same instant the list itself dies
// shoppinglist:{listId}:swaps   hash: lineId -> ShoppingListLineState, JSON,
//                               on the same clock as the Claims

const listKey = (listId: string) => `shoppinglist:${listId}`;

/**
 * Claims live beside the list, not inside it (#263). The list is one JSON
 * string, and "first tap wins" over a field of it would be a read-modify-write
 * race between two taps; a hash makes the race Redis's own — HSETNX decides it
 * in one round trip, with no lock and no retry loop. It also keeps the frozen
 * part frozen: nothing that moves is written back over the prices (#239).
 */
const claimsKey = (listId: string) => `shoppinglist:${listId}:claims`;

/**
 * A swap corrects a line's #234 state, and it lives beside the minted record
 * for the same reason a Claim does (#264): the record is the frozen part, and
 * rewriting one line inside one JSON string would be a read-modify-write over
 * everybody else's Claims and swaps. The correction is not a re-price of the
 * list — every candidate here was fetched by the same search, at mint, so a
 * swapped line is still costed at the prices the list promised.
 */
const swapsKey = (listId: string) => `shoppinglist:${listId}:swaps`;

/**
 * Written under the list's own key for as long as it is being priced, so the
 * id has an answer from the moment it is handed out. It does two jobs at once,
 * and they are the same job: a reader on any instance polls it instead of a
 * promise only the minting process holds, and the next completion reads it to
 * tell a live claim from one whose mint died. The finished list overwrites it;
 * a mint that never lands lets it expire, and the claim expires with it.
 */
const MINTING = 'minting';

/**
 * ADR 0001 leaves runtime versioning out "until session data begins surviving
 * deployments" — and this is the data that does. A Session lives 30 minutes
 * and never sees a deploy; a list lives seven days and will be read by a build
 * that did not write it. So the stored record carries a version the wire shape
 * does not, and a list written under a shape this build no longer understands
 * reads as gone rather than as a plausible-looking wrong list. Bump only for a
 * change old readers would misread — an additive field (ADR 0007) is not one.
 */
const STORED_VERSION = 1;

/**
 * A line's Product Match as minted — the whole top-5 the one search returned,
 * not just the product that won — beside the scaled amount the ladder was
 * given. Together they are everything a swap needs to re-price without asking
 * Woolworths anything. Kept off the wire deliberately: `cupString` and a
 * candidate's own price are the ladder's inputs, not things a Shopper reads,
 * and `runnersUp` is the picker's view of the same five.
 */
interface LineMatch {
  ingredient: IngredientAmount;
  candidates: ProductCandidate[];
}

interface StoredList {
  version: number;
  list: ShoppingList;
  /** By line id, for matched lines only. Absent on a list minted before #264. */
  matches?: Record<string, LineMatch>;
}

/** The chained MULTI builder, narrowed to the commands a Claim or swap needs. */
interface ListMulti {
  hsetnx(key: string, field: string, value: string): ListMulti;
  hset(key: string, field: string, value: string): ListMulti;
  pexpireat(key: string, timestampMs: number): ListMulti;
  exec(): Promise<unknown>;
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  multi(): ListMulti;
}

interface ShoppingListServiceDeps {
  redis: RedisLike;
  readSession: (sessionCode: string) => Promise<Session | null>;
  /** Mint-once, atomically: returns whichever id actually won the claim. */
  claimShoppingListId: (sessionCode: string, listId: string) => Promise<string>;
  /** Gives the claim back when the mint it was taken for never landed. */
  releaseShoppingListId: (sessionCode: string, listId: string) => Promise<void>;
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
  /** How long a waiting reader sleeps between looks at the marker. */
  pollMs?: number;
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
  /**
   * The minted list, or null. Waits out an in-flight mint of the same list —
   * wherever it is running, and only for as long as it could still be running.
   */
  readList(listId: string): Promise<ShoppingList | null>;
  /**
   * Claims one Ingredient Line for a Shopper, and answers with the list as it
   * now stands. The Claim is exclusive and the first tap wins, so the line may
   * come back holding somebody else's name — that is the answer, not an error.
   * Null when the list or the line names nothing.
   */
  claimLine(listId: string, lineId: string, displayName: string): Promise<ShoppingList | null>;
  /**
   * Releases the Claim on one Ingredient Line, whoever holds it, and answers
   * with the list as it now stands. Null when the list or the line names
   * nothing. Releasing an unclaimed line is a no-op, not a failure.
   */
  releaseLine(listId: string, lineId: string): Promise<ShoppingList | null>;
  /**
   * Swaps one Ingredient Line onto another of the candidates the Matcher
   * already fetched, re-prices it through the ladder, and answers with the list
   * as it now stands — visible to everyone holding the URL. A null Stockcode is
   * "none of these": the line demotes to Unmatched and drops out of every
   * count. Null when the list, the line, or the Stockcode names nothing.
   */
  swapLine(listId: string, lineId: string, stockcode: number | null): Promise<ShoppingList | null>;
}

const toProduct = (candidate: ProductCandidate): ShoppingListProduct => ({
  stockcode: candidate.stockcode,
  name: candidate.name,
  packageSize: candidate.packageSize,
});

/**
 * The candidates a line may actually be swapped onto. Woolworths' availability
 * flag only *penalises* a product in the ranking (#245), so one the store does
 * not have can sit in a stored top-5 — and offering it would price the line
 * against something that is not on the shelf. Offered and accepted read the
 * same list, so a picker gone stale cannot swap onto one either.
 */
const pickable = (match: LineMatch | undefined): ProductCandidate[] =>
  (match?.candidates ?? []).filter((candidate) => candidate.available);

/**
 * A swap blob this code did not write — a foreign shape, a half-written value —
 * must not take the whole list down on every read for the rest of its 7 days.
 * The line falls back to the record's own state, which is the same refusal
 * `readStored` makes for a record it does not recognise.
 */
function readSwap(listId: string, lineId: string, raw: string): ShoppingListLineState | undefined {
  try {
    return JSON.parse(raw) as ShoppingListLineState;
  } catch (error) {
    logger.warn({ err: error, listId, lineId }, 'Unreadable swap on Ingredient Line');
    return undefined;
  }
}

/**
 * The ladder's verdict as the state the line renders in. Shared by mint and by
 * a swap, so a corrected line reads exactly like one that matched this way the
 * first time — the whole point of the picker is that the cure leaves no trace.
 */
function toLineState(
  resolution: QuantityResolution,
  candidate: ProductCandidate,
  searchTerm: string
): ShoppingListLineState {
  if (resolution.state === 'unmatched') return { state: 'unmatched', searchTerm };
  const product = toProduct(candidate);
  if (resolution.state === 'priced') {
    return {
      state: 'priced',
      needs: resolution.needs,
      packs: resolution.packs,
      priceCents: resolution.priceCents,
      product,
    };
  }
  if (resolution.state === 'estimated') {
    return {
      state: 'estimated',
      needs: resolution.needs,
      priceCents: resolution.priceCents,
      product,
    };
  }
  return { state: 'unpriced_matched', product };
}

/**
 * The Ingredient Line's recipe text at its scaled amount — "250 g chicken
 * thigh", "2 garlic clove". An amount the source never stated leaves the line
 * as the ingredient alone rather than inventing a quantity for it.
 */
export function lineText(amount: number, unit: string, name: string): string {
  if (!(amount > 0)) return name;
  const shown = Number(amount.toFixed(2));
  // Spoonacular's metric rewrite states grams as "gr"; a human writes "g"
  // (#305). Display only — the structured unit is what pricing sees.
  const shownUnit = unit === 'gr' ? 'g' : unit;
  return shownUnit ? `${shown} ${shownUnit} ${name}` : `${shown} ${name}`;
}

/**
 * Units that state a portion of the dish, not an amount of anything buyable
 * ("2 servings scallions"). No cleaning turns that into a shoppable amount,
 * so the line degrades to the recipe's own wording.
 */
const JUNK_UNITS = new Set(['serving', 'servings']);

/** A PooledIngredient as the mint will state it; degraded renders `original`. */
type MintIngredient = PooledIngredient & { degraded: boolean };

/**
 * The sanitising pass at mint (#286). Names are cleaned of the quantity
 * phrases the source embeds in them, and one ingredient is one claimable
 * line: a duplicate merges into the first with the amounts combined, so two
 * Shoppers can never claim what is actually one ingredient and coverage never
 * counts it twice. A line that cannot be cleaned — a fragment left by a unit
 * eaten mid-word, a portion unit — is flagged to degrade to the recipe's own
 * wording rather than silently changing what is to be bought.
 */
function mintIngredients(ingredients: PooledIngredient[]): MintIngredient[] {
  const merged = new Map<string, MintIngredient>();
  for (const ingredient of ingredients) {
    const cleaned = JUNK_UNITS.has(ingredient.unit.toLowerCase())
      ? null
      : sanitiseIngredientName(ingredient.name);
    const entry: MintIngredient =
      cleaned === null
        ? { ...ingredient, degraded: true }
        : { ...ingredient, name: cleaned, degraded: false };
    // ponytail: the same name in two different units stays two lines —
    // combining them needs the unit conversion the ladder owns, not string
    // arithmetic. A degraded pair merges only on identical source wording.
    const key = entry.degraded
      ? `degraded ${entry.original}`
      : `${entry.name.toLowerCase()} ${entry.unit.toLowerCase()}`;
    const existing = merged.get(key);
    if (existing) existing.amount += entry.amount;
    else merged.set(key, entry);
  }
  return [...merged.values()];
}

export function createShoppingListService(deps: ShoppingListServiceDeps): ShoppingListService {
  const newListId = deps.newListId ?? randomUUID;
  const ttlMs = deps.ttlMs ?? SHOPPING_LIST_TTL_MS;
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;

  /** The record, the marker saying one is on its way, or nothing at all. */
  async function readStored(listId: string): Promise<StoredList | typeof MINTING | null> {
    const raw = await deps.redis.get(listKey(listId));
    if (!raw) return null;
    if (raw === MINTING) return MINTING;
    const stored = JSON.parse(raw) as Partial<StoredList>;
    if (stored.version !== STORED_VERSION || !stored.list) {
      logger.warn({ listId, version: stored.version }, 'Shopping List written by another shape');
      return null;
    }
    return stored as StoredList;
  }

  /** The finished record only: a mint still in flight has no lines to work on. */
  async function finished(listId: string): Promise<StoredList | null> {
    const stored = await readStored(listId);
    return stored === MINTING ? null : stored;
  }

  /**
   * The stored list wearing everything that has moved on it since: whoever
   * holds its lines, and any line a Shopper has corrected. Neither is written
   * back into the record — the record is the frozen part — so every read
   * assembles the three, and the assembled shape is what the wire ever sees.
   */
  async function assemble(stored: StoredList): Promise<ShoppingList> {
    const { list } = stored;
    const [claims, swaps] = await Promise.all([
      deps.redis.hgetall(claimsKey(list.listId)),
      deps.redis.hgetall(swapsKey(list.listId)),
    ]);
    return {
      ...list,
      lines: list.lines.map((line) => {
        const swapped = swaps[line.id] ? readSwap(list.listId, line.id, swaps[line.id]) : undefined;
        // The swap replaces what the line's state says and nothing else: the
        // id, the recipe text, the Staple flag and the Claim all stay put.
        const { id, text, staple } = line;
        const current: ShoppingListLine = swapped ? { id, text, staple, ...swapped } : line;
        const match = stored.matches?.[line.id];
        // The picker offers the other four — never the one already on the line.
        // Present-but-empty on a search that found a single product, because
        // the field is what says this line *has* a picker, and even an empty
        // one still offers "none of these" (#264).
        const runnersUp = pickable(match)
          .filter(
            (candidate) =>
              !('product' in current) || candidate.stockcode !== current.product.stockcode
          )
          .map(toProduct);
        return {
          ...current,
          ...(match ? { runnersUp } : {}),
          ...(claims[line.id] ? { claimedBy: claims[line.id] } : {}),
        };
      }),
    };
  }

  /**
   * The instant the list dies, which is the instant its Claims must. Set from
   * the list's own mint time rather than as a fresh TTL, so claiming — like
   * reading — extends nothing (#229).
   */
  const diesAt = (list: ShoppingList) => Date.parse(list.mintedAt) + ttlMs;

  async function buildLine(
    index: number,
    ingredient: MintIngredient,
    factor: number
  ): Promise<{ line: ShoppingListLine; match?: LineMatch }> {
    const scaled = ingredient.amount * factor;
    const fields = {
      id: String(index),
      // A line the sanitiser could not clean shows the recipe's own wording,
      // whole — never a mangled hybrid of two quantity phrases (#286).
      text: ingredient.degraded
        ? ingredient.original
        : lineText(scaled, ingredient.unit, ingredient.name),
      staple: isStaple(ingredient.name),
    };
    // The Retailer search is what an Unmatched line offers instead of a product,
    // so it is exactly the term the Matcher searched (#285) — measurement junk
    // dropped, in the local dialect (#241).
    const searchTerm = deriveSearchTerm(ingredient.name);
    const unmatched = { line: { ...fields, state: 'unmatched', searchTerm } as ShoppingListLine };

    // A Staple is assumed already at home and counted by nothing, so it never
    // costs a Retailer lookup — it renders as its own text, still shoppable.
    if (fields.staple) return unmatched;

    const outcome = await deps.matchProduct(ingredient.name);
    // A zero or missing amount is not a quantity, and the ladder is explicit
    // that null degrades rather than pricing a line nobody can shop.
    const amount: IngredientAmount = {
      name: ingredient.name,
      amount: scaled > 0 ? scaled : null,
      unit: ingredient.unit,
    };
    const resolution = await deps.resolveLine(amount, outcome);
    if (outcome.status !== 'matched') return unmatched;

    return {
      line: { ...fields, ...toLineState(resolution, outcome.match, searchTerm) },
      // The whole top-5 the one search paid for, written down beside the line
      // so the swap picker never costs a second one (#264). The scaled amount
      // rides along because re-pricing needs the same input the ladder had.
      match: { ingredient: amount, candidates: [outcome.match, ...outcome.runnersUp] },
    };
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
    const matches: Record<string, LineMatch> = {};
    for (const [index, ingredient] of mintIngredients(recipe.ingredients).entries()) {
      const built = await buildLine(index, ingredient, factor);
      lines.push(built.line);
      if (built.match) matches[built.line.id] = built.match;
    }

    const list: ShoppingList = {
      listId,
      recipeName: recipe.name,
      headcount,
      // What the amounts were stated for, so the page can only claim "Scaled
      // for N" when a scale actually happened.
      servings: recipe.servings,
      lines,
      // Snapshotted, because cooking happens days after the pool has aged out
      // and the source may have forgotten the recipe entirely (#247).
      steps: recipe.steps,
      sourceName: recipe.sourceName,
      sourceUrl: recipe.sourceUrl,
      // An Owned Recipe has no source to credit, and the Cook View must be
      // told so rather than inferring it from the absent name — absence is a
      // data glitch on a Sourced Recipe, and the vendor credit is a licence
      // obligation (ADR 0012, #314). The `owned:` identity is the fact.
      provenance: recipe.placeId.startsWith('owned:') ? 'owned' : undefined,
      mintedAt: new Date(now()).toISOString(),
    };
    await deps.redis.set(
      listKey(listId),
      JSON.stringify({ version: STORED_VERSION, list, matches } satisfies StoredList),
      'PX',
      ttlMs
    );
    logger.info({ listId, headcount, lineCount: lines.length }, 'Shopping List minted');
    return list;
  }

  return {
    async mint(sessionCode: string, placeId: string): Promise<string | undefined> {
      const session = await deps.readSession(sessionCode);
      if (!session?.cravingKey || session.headcount === undefined) return undefined;

      // A Session that already names a list has its answer, and nothing prices
      // it twice — unless the mint behind that id never landed. A process that
      // died mid-price leaves the claim pointing at a list nobody will ever
      // write, and the marker's expiry is the only thing that says so. Then
      // the id is dead and the claim goes back, so this completion can mint.
      if (session.shoppingListId) {
        if ((await readStored(session.shoppingListId)) !== null) return session.shoppingListId;
        logger.warn(
          { sessionCode, listId: session.shoppingListId },
          'Shopping List claim abandoned mid-mint, minting again'
        );
        // Deliberately unguarded, unlike the cleanup on a failed mint: if the
        // claim will not come back, minting on anyway would only lose the race
        // to HSETNX and hand back the same dead id. Better to fail this
        // completion — the caller degrades to no list — and retry from clean.
        await deps.releaseShoppingListId(sessionCode, session.shoppingListId);
      }

      const recipe = await deps.readRecipe(session.cravingKey, placeId);
      if (!recipe) {
        // ponytail: the shared pool is the only copy of a dealt *Sourced*
        // Recipe's ingredients — an Owned one is read from the corpus, which
        // never ages out — and a Session (30 min) can outlive the pool it dealt
        // from (24 h) by minutes. Ceiling: that Session ends at its Top Pick
        // with no list. Upgrade path: stash the dealt Recipes whole beside the
        // Deck at deal time, which costs every Session what this costs ~1%.
        logger.warn({ sessionCode, placeId }, 'Crowned Recipe gone from its pool, no list minted');
        return undefined;
      }

      // Marked before the claim, never after. The marker is what says a claim
      // is alive, so the winner must not be catchable between claiming an id
      // and marking it — a completion landing in that gap would read the live
      // claim as abandoned and price the same Top Pick a second time.
      const candidate = newListId();
      await deps.redis.set(listKey(candidate), MINTING, 'PX', MINTING_TTL_MS);

      const listId = await deps.claimShoppingListId(sessionCode, candidate);
      // Two completions landing together: whoever lost the claim reads the
      // winner's list. The mark it will never mint under is left to expire —
      // that id reached no caller, so nothing can ever ask for it.
      if (listId !== candidate) return listId;

      void build(listId, session.headcount, recipe).catch(async (error: unknown) => {
        // A mint that fails leaves no key, so the URL 404s and says so —
        // better than a half-priced list nobody can tell is half-priced.
        // Clearing the marker now rather than waiting out its TTL is what
        // makes the retry immediate: while it stands, the claim reads as live.
        logger.error({ err: error, sessionCode, listId }, 'Shopping List mint failed');
        await deps.redis.del(listKey(listId)).catch(() => undefined);
        await deps.releaseShoppingListId(sessionCode, listId).catch(() => undefined);
      });

      return listId;
    },

    async readList(listId: string): Promise<ShoppingList | null> {
      // Polled, not awaited on a local promise: the mint may be running in
      // another process entirely, and the marker is all two of them share. The
      // wait ends when the marker does — overwritten by the finished list, or
      // expired by Redis — so a reader arriving late waits only what is left
      // of it. The cap is nothing but a promise that a marker which somehow
      // never expires cannot pin the connection open forever.
      const attempts = Math.ceil(MINTING_TTL_MS / pollMs);
      let stored = await readStored(listId);
      for (let i = 0; stored === MINTING && i < attempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        stored = await readStored(listId);
      }
      // A marker still standing is a mint that died: nothing is coming, and
      // the URL says so rather than waiting on it.
      if (stored === MINTING || !stored) return null;
      return assemble(stored);
    },

    async claimLine(listId, lineId, displayName) {
      const stored = await finished(listId);
      if (!stored?.list.lines.some((line) => line.id === lineId)) return null;
      const { list } = stored;

      // The whole race, decided by Redis in one round trip: HSETNX writes only
      // into an empty field, so the second tap changes nothing and reads the
      // first tapper's name back out below. The expiry rides along in the same
      // MULTI — split across two calls, a process dying between them would
      // leave the Claims with no clock at all, outliving the list they are on.
      // ponytail: MULTI, not Lua — two commands, one round trip, as claimBuyer
      // does for the Group Order's own first-tap-wins.
      await deps.redis
        .multi()
        .hsetnx(claimsKey(listId), lineId, displayName)
        .pexpireat(claimsKey(listId), diesAt(list))
        .exec();
      return assemble(stored);
    },

    async releaseLine(listId, lineId) {
      const stored = await finished(listId);
      if (!stored?.list.lines.some((line) => line.id === lineId)) return null;

      // Any Shopper may release any Claim (#229), so there is nothing to check
      // it against — a drop-out's lines have to be rescuable by whoever is
      // still shopping. Taking the freed line is a separate deliberate tap.
      await deps.redis.hdel(claimsKey(listId), lineId);
      return assemble(stored);
    },

    async swapLine(listId, lineId, stockcode) {
      const stored = await finished(listId);
      // The line first, and never the record's own key lookup alone: `matches`
      // comes back from JSON.parse wearing Object.prototype, so a lineId of
      // "toString" would read as a live entry and blow up on it. A lineId names
      // a line or it names nothing.
      if (!stored?.list.lines.some((line) => line.id === lineId)) return null;
      // No Match behind a line is no picker in front of it: a Staple, a clean
      // miss, or a list minted before #264 has nothing to swap between.
      const match = stored.matches?.[lineId];
      if (!match) return null;

      // The Retailer search a demoted line falls back to is the same one it
      // would have had if the Matcher had found nothing in the first place —
      // one derivation for mint and demotion both (#285).
      const searchTerm = deriveSearchTerm(match.ingredient.name);
      let state: ShoppingListLineState;
      if (stockcode === null) {
        // "None of these": Unmatched, out of the tally and every Tally with it.
        state = { state: 'unmatched', searchTerm };
      } else {
        // Only the ones this line's own search fetched and the store actually
        // has — a Stockcode from anywhere else would be a Retailer lookup
        // wearing a swap's clothes, and an unavailable one prices a line
        // against nothing on the shelf.
        const candidate = pickable(match).find((entry) => entry.stockcode === stockcode);
        if (!candidate) return null;
        const resolution = await deps.resolveLine(match.ingredient, {
          status: 'matched',
          match: candidate,
          runnersUp: [],
        });
        state = toLineState(resolution, candidate, searchTerm);
      }

      // HSET, not HSETNX: a swap is a correction, not a race — the last Shopper
      // to look at the line is the one who has seen the product. The expiry
      // rides along for the same reason the Claims' does.
      await deps.redis
        .multi()
        .hset(swapsKey(listId), lineId, JSON.stringify(state))
        .pexpireat(swapsKey(listId), diesAt(stored.list))
        .exec();
      return assemble(stored);
    },
  };
}

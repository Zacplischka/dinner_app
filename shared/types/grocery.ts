// The Product Matcher's wire shapes (issue #256, ADR 0010). The candidate is
// what the swap picker renders and the quantity ladder (#257) consumes.

/**
 * One Woolworths product as the Matcher promises it. `packageSize` is the raw
 * Woolworths pack string, carried untouched — parsing it is the quantity
 * ladder's job (#257). `priceCents` is the online Price, the promised price:
 * the deep link must never disagree with it. InstorePrice stays on the
 * backend's cached record only — it is never shown in the UI (ADR 0010), so
 * it has no seat on the wire shape.
 */
export interface ProductCandidate {
  /** Woolworths Stockcode — deep-linkable product id. */
  stockcode: number;
  name: string;
  brand?: string;
  packageSize?: string;
  priceCents?: number;
  /** Woolworths unit-price string, e.g. "$1.13 / 100G". */
  cupString?: string;
  available: boolean;
}

export interface ProductMatch {
  match: ProductCandidate;
  /** Up to 4 runner-up candidates for the swap picker (top-5 total). */
  runnersUp: ProductCandidate[];
}

/**
 * The Matcher's verdict for one search term. A clean miss (`no_product` — no
 * fulfilling product exists) is distinct from a failure (`failed` — the answer
 * was unusable); the two cache for different windows.
 */
export type ProductMatchOutcome =
  | ({ status: 'matched' } & ProductMatch)
  | { status: 'no_product' }
  | { status: 'failed' };

/** The needed amount, normalized to the family the buy decision was made in. */
export interface NeededAmount {
  amount: number;
  unit: 'g' | 'mL' | 'each';
}

/**
 * The quantity ladder's verdict for one Ingredient Line (#257): the four #234
 * states. Priced and Estimated are in the Tally ("needs 250g · buy 1 × 400g
 * tin"); the other two are principled degrades — a line is never blocked and
 * never guessed. Estimated is variable-weight pricing: unit price × needed
 * mass, rendered "≈ … (est.)".
 */
export type QuantityResolution =
  | { state: 'priced'; needs: NeededAmount; packs: number; priceCents: number }
  | { state: 'estimated'; needs: NeededAmount; priceCents: number }
  | {
      state: 'unpriced_matched';
      /** Diagnostic prose for logs only — never branch on it, never show it. */
      reason: string;
    }
  | { state: 'unmatched' };

export function woolworthsProductUrl(stockcode: number): string {
  return `https://www.woolworths.com.au/shop/productdetails/${stockcode}`;
}

export function woolworthsSearchUrl(term: string): string {
  return `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(term)}`;
}

// --- The Shopping List resource (#262) --------------------------------------
// Minted once from a completed Cook Session's Top Pick and read from its own
// URL, which is the whole capability: no Participant check, no live Session.
// Frozen at mint — reopening re-reads, never re-prices (#239).

/**
 * The Retailer product a matched line was priced from: the `ProductCandidate`
 * above, narrowed to what a frozen list may still say. `priceCents`,
 * `cupString` and `available` are deliberately dropped — they are facts about
 * the product *now*, and a list minted last Tuesday must not carry a live
 * price beside the frozen one its line was actually costed at.
 *
 * Not a Product Match (CONTEXT.md): a Product Match includes the runner-up
 * candidates behind the swap picker, which this slice does not carry.
 */
export interface ShoppingListProduct {
  /** Woolworths Stockcode. The deep link is minted through the counting
   * redirect (#228), never linked directly — see woolworthsProductUrl. */
  stockcode: number;
  name: string;
  packageSize?: string;
}

interface ShoppingListLineFields {
  /** This line's identity on this list, stable across reads. */
  id: string;
  /** The Ingredient Line's recipe text and amount, scaled to the Headcount. */
  text: string;
  /** A Staple: rendered unticked, counted by nothing (list total, Tally, coverage). */
  staple: boolean;
  /**
   * The Shopper holding this line — a self-declared display name, nothing the
   * server ever verified (CONTEXT.md: Shopper) — or absent when nobody does.
   * One name, never a set: a Claim is exclusive and the first tap wins (#229).
   * Additive (ADR 0007) — a list minted before Claims existed simply has none.
   */
  claimedBy?: string;
}

/**
 * One Ingredient Line on the wire, in exactly one of #234's four states. All
 * four are first-class: a line is never dropped, never blocked, never guessed.
 * Priced and Estimated are in the tally; the other two are principled degrades.
 */
export type ShoppingListLine = ShoppingListLineFields &
  (
    | {
        state: 'priced';
        needs: NeededAmount;
        packs: number;
        priceCents: number;
        product: ShoppingListProduct;
      }
    | { state: 'estimated'; needs: NeededAmount; priceCents: number; product: ShoppingListProduct }
    | { state: 'unpriced_matched'; product: ShoppingListProduct }
    /**
     * No product: the recipe text plus a Retailer search for this term. Read
     * it as the rendering #234 specifies, not as a claim about the Retailer's
     * catalogue — a Staple takes this state without ever having been asked,
     * because it is outside every count and a lookup for it would price
     * nothing. `staple` is what tells the two apart.
     */
    | { state: 'unmatched'; searchTerm: string }
  );

export interface ShoppingList {
  listId: string;
  recipeName: string;
  /** Inert (#239): displayed as "Scaled for N". Nothing recomputes from it. */
  headcount: number;
  /**
   * What the source stated its amounts for — the denominator the scale used.
   * Absent when the source never said, in which case the lines are the recipe's
   * own amounts and the page must not claim to have scaled them to anything.
   */
  servings?: number;
  lines: ShoppingListLine[];
  /** Snapshotted at mint (#247) so cooking survives the source forgetting. */
  steps: string[];
  /** The end-of-method credit, and the degrade path when `steps` is empty. */
  sourceName?: string;
  sourceUrl?: string;
  /** ISO. The list's 7-day clock starts here and nothing extends it. */
  mintedAt: string;
}

// GET /api/lists/:listId — the whole body is the resource.
export type ShoppingListResponse = ShoppingList;

/**
 * POST /api/lists/:listId/lines/:lineId/claim — the whole body (#263). The
 * Shopper is a self-declared display name and nothing else: the URL is the
 * capability, so there is no token, no participant id, and no Session to
 * check the name against.
 */
export interface ClaimLineRequest {
  displayName: string;
}

/**
 * The longest a Shopper's name may be — long enough for a real one, short
 * enough to render beside a line. Shared because both sides enforce it and
 * they must agree (ADR 0006): the input stops at it, the endpoint rejects
 * past it.
 */
export const MAX_SHOPPER_NAME = 50;

/**
 * Claiming and releasing both answer with the whole list, at its new state.
 * A Claim is the only thing on it that moves, and every derived display —
 * the Tally, coverage, "claimed by <name>" — reads the same lines the GET
 * does, so one shape serves all three verbs. A tap that lost the race is not
 * an error: it answers 200 with the winner's name on the line (#229).
 */
export type ClaimLineResponse = ShoppingList;

export interface ShoppingListTotal {
  cents: number;
  /** ≈ (#234): a sum containing an Estimated line is itself an estimate. */
  estimated: boolean;
  /** "+ N unpriced items" — states 3 and 4. Staples were never in the count. */
  unpricedCount: number;
}

/**
 * The list total over in-tally lines, and what the headline must say about it.
 * Staples are outside every count by the Staple rule, so they are dropped
 * first. The same arithmetic serves a per-Shopper Tally (#263) over that
 * Shopper's claimed lines — hence a plain function over any line subset.
 */
export function shoppingListTotal(lines: ShoppingListLine[]): ShoppingListTotal {
  const counted = lines.filter((line) => !line.staple);
  return {
    cents: counted.reduce(
      (sum, line) =>
        sum + (line.state === 'priced' || line.state === 'estimated' ? line.priceCents : 0),
      0
    ),
    estimated: counted.some((line) => line.state === 'estimated'),
    unpricedCount: counted.filter(
      (line) => line.state === 'unpriced_matched' || line.state === 'unmatched'
    ).length,
  };
}

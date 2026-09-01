// The Product Matcher: the per-Retailer judge that turns Woolworths' raw
// search answer into an Ingredient Line's Product Match, or the verdict that
// no product fulfils it (issue #256). Storefront Resolver pattern; pure —
// fetch and cache live in ProductMatchService.
import type { ProductCandidate, ProductMatch } from '@dinder/shared/types';

/**
 * A cached Woolworths product: the wire candidate plus the fields that stay
 * in the cached record only (ADR 0010) — shop-taxonomy strings as re-ranker
 * signal, and InstorePrice for the divergence counter, never for the UI.
 */
export interface WoolworthsProduct extends ProductCandidate {
  /** SAP category, e.g. "VEG / FRESHCUTS". Marketplace listings carry none. */
  sapCategory?: string;
  sapSubCategory?: string;
  instorePriceCents?: number;
}

// Shop sections that never hold a cooking ingredient, matched against the SAP
// taxonomy only — never the pies category paths, where "Chips" appears inside
// legitimate ingredient categories like taco shells (#245's store-1101
// tuning), and never product names. BISCUITS is in per #245: it beats real
// sour cream at store 1101. A non-food section can hide under a food aisle
// ("MEAT CONVENIENCE" → "PET NEEDS - FRESH" is chilled dog food), so these
// are tested against aisle and shelf together.
const BLOCKED_SECTIONS =
  /biscuit|confection|chocolate|soft drink|cordial|energy drink|\bpet\b|dog|cat food|hair|skin|beauty|kitchen|cleaning|laundry|bathroom|baby care|toiletr|manchester/i;

// Snack food is the one section named at aisle level only (#328). "Snack" has
// to stay — the SNACKS aisle beat real sour cream at store 1101 (#245) — but
// it also labels shelves *inside* ingredient aisles ("VEG / FRESHCUTS / HARD
// PRODUCE" → "NUTS AND SNACKS"), and a shelf label must not evict the aisle
// it sits in: that is how a real ingredient falls to Unmatched with no
// product behind it.
const BLOCKED_AISLES = /snack/i;

function inBlockedSection(product: WoolworthsProduct): boolean {
  return (
    BLOCKED_AISLES.test(product.sapCategory ?? '') ||
    BLOCKED_SECTIONS.test(`${product.sapCategory} ${product.sapSubCategory ?? ''}`)
  );
}

// Descriptor words that carry no product identity ("fresh", "chopped", …).
const STOP_WORDS = new Set([
  'fresh',
  'dried',
  'ground',
  'whole',
  'chopped',
  'sliced',
  'diced',
  'grated',
  'crushed',
  'trimmed',
  'leaves',
  'stalks',
  'cloves',
  'sprigs',
  'bunch',
  'tinned',
  'canned',
  'flat',
  'leaf',
  'green',
  'red',
  'brown',
  'short',
  'grain',
  'thai',
  'japanese',
  'greek',
  'lebanese',
  'desiree',
  'iceberg',
]);

function identityKeywords(term: string): string[] {
  return (term.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => word.length > 2 && !STOP_WORDS.has(word)
  );
}

function score(product: WoolworthsProduct, keywords: string[], rank: number): number {
  let value = -0.35 * rank; // search rank is a real relevance signal
  const name = product.name.toLowerCase();
  if (keywords.length) {
    // Identity has to survive re-ranking, or chicken stock becomes vegetable stock.
    value += (2 * keywords.filter((word) => name.includes(word)).length) / keywords.length;
  }
  if (!product.available) value -= 2;
  // #245: unavailable-at-store products often carry no price; penalise so a
  // priceable candidate wins when identity ties.
  if (product.priceCents === undefined) value -= 1;
  return value;
}

function toCandidate(product: WoolworthsProduct): ProductCandidate {
  const candidate = { ...product };
  delete candidate.sapCategory;
  delete candidate.sapSubCategory;
  delete candidate.instorePriceCents;
  return candidate;
}

/**
 * Rank the top-5 answer for one (translated) search term. Marketplace junk —
 * no SAP category, or a blocklisted section — never surfaces as a candidate;
 * if nothing survives the filter, the search counts as having returned zero
 * results (#243's sapcat guard) and the verdict is a clean miss (`null`).
 */
export function matchProducts(products: WoolworthsProduct[], term: string): ProductMatch | null {
  const eligible = products
    .map((product, rank) => ({ product, rank }))
    .filter(({ product }) => product.sapCategory && !inBlockedSection(product));
  if (eligible.length === 0) return null;

  const keywords = identityKeywords(term);
  const ranked = eligible
    .map(({ product, rank }) => ({ product, value: score(product, keywords, rank) }))
    .sort((left, right) => right.value - left.value);

  return {
    match: toCandidate(ranked[0].product),
    // Four, because the picker is a top-5 and the match is the first of them
    // (#264) — carrying more would only fatten every Shopping List that
    // stores them. Available candidates only: the picker refuses to swap onto
    // a product the store does not have, so an unavailable runner-up is a
    // wasted slot — a line whose picker opens onto nothing but "None of
    // these" (#285). The match itself may still be unavailable (only score-
    // penalised): surfacing the honest-but-out-of-stock winner is what lets
    // "none of these" demote it, per #245's Thai basil case.
    runnersUp: ranked
      .slice(1)
      .filter(({ product }) => product.available)
      .slice(0, 4)
      .map(({ product }) => toCandidate(product)),
  };
}

// The Product Matcher: the per-Retailer judge that turns Woolworths' raw
// search answer into an Ingredient Line's Product Match, or the verdict that
// no product fulfils it (issue #256). Storefront Resolver pattern; pure —
// fetch and cache live in ProductMatchService.
import type { ProductCandidate, ProductMatch } from '@dinder/shared/types';

/**
 * A cached Woolworths product: the wire candidate plus the shop-taxonomy
 * strings that stay in the cached record as re-ranker signal only (ADR 0010).
 */
export interface WoolworthsProduct extends ProductCandidate {
  /** SAP category, e.g. "VEG / FRESHCUTS". Marketplace listings carry none. */
  sapCategory?: string;
  sapSubCategory?: string;
}

// Shop sections that never hold a cooking ingredient, matched against the SAP
// taxonomy only — never the pies category paths, where "Chips" appears inside
// legitimate ingredient categories like taco shells (#245's store-1101
// tuning), and never product names. SNACKS/BISCUITS are in per #245: those
// sections beat real sour cream at store 1101.
const BLOCKED_SECTIONS =
  /snack|biscuit|confection|chocolate|soft drink|cordial|energy drink|pet |pet$|dog|cat food|hair|skin|beauty|kitchen|cleaning|laundry|bathroom|baby care|toiletr|manchester/i;

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
    .filter(
      ({ product }) =>
        product.sapCategory &&
        !BLOCKED_SECTIONS.test(`${product.sapCategory} ${product.sapSubCategory ?? ''}`)
    );
  if (eligible.length === 0) return null;

  const keywords = identityKeywords(term);
  const ranked = eligible
    .map(({ product, rank }) => ({ product, value: score(product, keywords, rank) }))
    .sort((left, right) => right.value - left.value);

  return {
    match: toCandidate(ranked[0].product),
    runnersUp: ranked.slice(1).map(({ product }) => toCandidate(product)),
  };
}

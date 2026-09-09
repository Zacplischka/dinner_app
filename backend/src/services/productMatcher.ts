// The Product Matcher: the per-Retailer judge that turns Woolworths' raw
// search answer into an Ingredient Line's Product Match, or the verdict that
// no product fulfils it (issue #256). Storefront Resolver pattern; pure —
// fetch and cache live in ProductMatchService.
// Sections and pack forms are ranking signals as well as filters. One cached
// answer can match different lines differently: never memoise by term alone.
import type { ProductCandidate, ProductMatch } from '@dinder/shared/types';
import { parsePack } from './packParser.js';
import type { WantedPackForm } from './quantityLadder.js';

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
// tuning), and never product names. SNACKS/BISCUITS are in per #245: those
// sections beat real sour cream at store 1101.
const BLOCKED_SECTIONS =
  /snack|biscuit|confection|chocolate|soft drink|cordial|energy drink|vitamins|\bpet\b|dog|cat food|hair|skin|beauty|kitchen|cleaning|laundry|bathroom|baby care|toiletr|manchester/i;

const UNSUITABLE_PENALTY = 1.5;
const produceNuts = (product: WoolworthsProduct): boolean =>
  /^VEG(?:\s*\/|$)/i.test(product.sapCategory?.trim() ?? '') &&
  /^NUTS AND SNACKS$/i.test(product.sapSubCategory?.trim() ?? '');

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

function score(
  product: WoolworthsProduct,
  keywords: string[],
  rank: number,
  wantedForm?: WantedPackForm
): number {
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
  const pack = parsePack(product.packageSize);
  // ponytail: count-vs-volume approximates the ladder's async liquid check;
  // use verified ingredient consistency if bare-count liquids become common.
  // Mass-vs-volume stays neutral (#367): the ladder can price liquid ingredients
  // this way, and a pure matcher cannot decide their consistency.
  const refusedPack =
    (pack?.kind === 'fixed' && pack.family === 'volume' && wantedForm === 'count') ||
    (pack?.kind === 'count' && (wantedForm === 'mass' || wantedForm === 'volume'));
  if (refusedPack || produceNuts(product)) {
    // ponytail: stay below one identity keyword's weight; identity-first ordering
    // could cross more rank places, but needs a new store tally before adoption.
    value -= Math.min(UNSUITABLE_PENALTY, 2 / Math.max(1, keywords.length) - 0.01);
  }
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
export function matchProducts(
  products: WoolworthsProduct[],
  term: string,
  wantedForm?: WantedPackForm
): ProductMatch | null {
  // Bare garlic/cloves mean a fresh ingredient, not a prepared substitute.
  // Keep explicitly requested paste, powder, etc. on the usual matching path.
  const freshGarlic = /^(?:fresh |whole )?garlic(?: cloves?| bulbs?| heads?| loose)?$/i.test(
    term.trim()
  );
  const eligible = products
    .map((product, rank) => ({ product, rank }))
    .filter(({ product }) => {
      // Only exempt the measured subcategories. Keep the combined taxonomy
      // check so phrases such as CAT + FOOD still match across the boundary.
      const subCategory =
        produceNuts(product) ||
        // "soft drink" also matches "SOFT DRINKS": preserve the measured water
        // shelf explicitly, without admitting carbonated soft drinks (#367).
        (/^LIFESTYLE\/WATER NON CARBONATED$/i.test(product.sapCategory?.trim() ?? '') &&
          /^SOFT DRINKS - WATER$/i.test(product.sapSubCategory?.trim() ?? ''))
          ? ''
          : (product.sapSubCategory ?? '');
      return (
        product.sapCategory &&
        !BLOCKED_SECTIONS.test(`${product.sapCategory} ${subCategory}`) &&
        (!freshGarlic ||
          (/\bgarlic\b/i.test(product.name) &&
            !/\b(pastes?|crushed|minced|chopped|dried|powder|granules?|bread|butter|oil|sauce|dip|aioli|salt|pickled|black|roasted|supplements?)\b/i.test(
              product.name
            )))
      );
    });
  if (eligible.length === 0) return null;

  const keywords = identityKeywords(term);
  const ranked = eligible
    .map(({ product, rank }) => ({ product, value: score(product, keywords, rank, wantedForm) }))
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

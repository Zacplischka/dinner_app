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

export function woolworthsProductUrl(stockcode: number): string {
  return `https://www.woolworths.com.au/shop/productdetails/${stockcode}`;
}

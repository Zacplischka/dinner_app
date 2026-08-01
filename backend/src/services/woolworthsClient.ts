// The Woolworths search client: the fetch boundary and nothing else (ADR
// 0010). Direct first-party product search from our own egress — no proxy, no
// scraping, no challenge circumvented. Identity is header-carried (`From` +
// `X-Requested-With`); the browser UA is pinned, never rotated — rotation is
// the fingerprint evasion ADR 0010 renounces.
import { number, string } from './storefrontResolution.js';
import type { WoolworthsProduct } from './productMatcher.js';

const BASE = 'https://www.woolworths.com.au';
const PINNED_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IDENTITY_HEADERS = {
  'User-Agent': PINNED_UA,
  From: 'zacplischka@gmail.com',
  'X-Requested-With': 'Dinder/1.0 (+https://github.com/Zacplischka/dinner_app)',
};
// Every result the one PageSize-10 request already paid for. The Matcher's
// picker is a top-5, but its sapcat guard and blocklist eat candidates before
// ranking — parsing only 5 raw results is how a matched line ends up with an
// empty swap picker (#285). Deliberately wider than ADR 0010's "top-5 trimmed
// candidates" cache line: same request count, the cached record roughly
// doubles to ~2-4 KB per term.
const TOP_N = 10;

export interface WoolworthsSearchResult {
  /** The FulfilmentStoreId read off the response; null when absent. */
  storeId: number | null;
  products: WoolworthsProduct[];
}

export interface WoolworthsClient {
  search(term: string): Promise<WoolworthsSearchResult>;
}

/**
 * A search failure (network error, non-200, unusable body) throws — the
 * caller caches it for the failure window. A clean zero-result answer returns
 * `products: []`.
 */
export function createWoolworthsClient(fetchImpl: typeof fetch = fetch): WoolworthsClient {
  // One GET seeds the session cookies the search API expects; dropped on
  // failure so the next attempt (after the ~1 h failure window) re-seeds.
  let cookies: string | null = null;

  async function seed(): Promise<string> {
    const response = await fetchImpl(`${BASE}/shop/search/products?searchTerm=carrot`, {
      headers: { ...IDENTITY_HEADERS, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) throw new Error(`Woolworths seed failed with status ${response.status}`);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }

  return {
    async search(term: string): Promise<WoolworthsSearchResult> {
      try {
        cookies ??= await seed();
        const location = `/shop/search/products?searchTerm=${encodeURIComponent(term)}`;
        const response = await fetchImpl(`${BASE}/apis/ui/Search/products`, {
          method: 'POST',
          headers: {
            ...IDENTITY_HEADERS,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Origin: BASE,
            Referer: BASE + location,
            Cookie: cookies,
          },
          body: JSON.stringify({
            SearchTerm: term,
            PageNumber: 1,
            PageSize: 10,
            SortType: 'TraderRelevance',
            IsSpecial: false,
            Location: location,
            formatObject: JSON.stringify({ name: term }),
            isBundle: false,
            isMobile: false,
            Filters: [],
          }),
        });
        if (!response.ok)
          throw new Error(`Woolworths search failed with status ${response.status}`);
        return parseSearchResponse(await response.json());
      } catch (error) {
        cookies = null;
        throw error;
      }
    },
  };
}

function parseSearchResponse(body: unknown): WoolworthsSearchResult {
  if (!body || typeof body !== 'object' || !('Products' in body)) {
    throw new Error('Woolworths search returned an unusable body');
  }
  const answer = body as Record<string, unknown>;
  const groups = Array.isArray(answer.Products) ? answer.Products : [];

  const products: WoolworthsProduct[] = [];
  let storeId = number(answer.FulfilmentStoreId) ?? null;
  for (const group of groups.slice(0, TOP_N)) {
    const raw = (group as { Products?: unknown[] })?.Products?.[0];
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const stockcode = number(item.Stockcode);
    const name = string(item.Name);
    if (stockcode === undefined || !name) continue;
    storeId ??= number(item.FulfilmentStoreId) ?? null;
    const attributes = (item.AdditionalAttributes ?? {}) as Record<string, unknown>;
    const price = number(item.Price);
    const instorePrice = number(item.InstorePrice);
    products.push({
      stockcode,
      name,
      brand: string(item.Brand),
      packageSize: string(item.PackageSize),
      priceCents: price === undefined ? undefined : Math.round(price * 100),
      instorePriceCents: instorePrice === undefined ? undefined : Math.round(instorePrice * 100),
      cupString: string(item.CupString),
      available: item.IsAvailable !== false,
      sapCategory: string(attributes.sapcategoryname),
      sapSubCategory: string(attributes.sapsubcategoryname),
    });
  }
  return { storeId, products };
}

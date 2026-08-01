/** One `complexSearch` hit, in the raw shape the real endpoint returns. */
export interface RecipeSearchHit {
  id: number;
  title: string;
  image?: string;
  aggregateLikes?: number;
  servings?: number;
  sourceUrl?: string;
  sourceName?: string;
  extendedIngredients?: Array<{
    name?: string;
    amount?: number;
    unit?: string;
    original?: string;
  }>;
  analyzedInstructions?: Array<{ steps?: Array<{ step?: string }> }>;
}

/** `count` plausible hits, so a pool test doesn't hand-write sixty fixtures. */
export function recipeHits(count: number, prefix = 'Recipe'): RecipeSearchHit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `${prefix} ${i + 1}`,
    image: `https://img.spoonacular.com/${i + 1}.jpg`,
    aggregateLikes: i,
    servings: 4,
    extendedIngredients: [
      { name: 'olive oil', amount: 1, unit: 'tbsp', original: '1 tbsp olive oil' },
    ],
    analyzedInstructions: [{ steps: [{ step: 'Cook it.' }] }],
  }));
}

/**
 * A fetch-boundary fake for the Spoonacular endpoints Dinder calls: recipe
 * search (the Deck pool), Convert Amounts, ingredient search, and ingredient
 * information. Ingredients absent from `ingredients` search as unknown;
 * Convert answers `gramsPerUnit["<name>:<sourceUnit>"]` (Convert never
 * refuses — a missing entry answers with no number, the way the real API
 * answers junk). `recipes` is served by complexSearch, sliced by the request's
 * own offset/number the way the real pagination does. Set `failWith` to make
 * every endpoint an HTTP error. Records request URLs.
 */
export function spoonacularFetchFake(spec: {
  ingredients?: Record<string, { id: number; consistency?: 'liquid' | 'solid' }>;
  gramsPerUnit?: Record<string, number>;
  recipes?: RecipeSearchHit[];
  failWith?: number;
  /**
   * The cumulative `X-API-Quota-Used` every response carries — what the #261
   * points guard counts. A function is re-read per request, so a test can
   * watch the points climb the way a real day does.
   */
  quotaUsed?: number | (() => number);
}) {
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const quotaHeaders = (): Record<string, string> => {
    const used = typeof spec.quotaUsed === 'function' ? spec.quotaUsed() : spec.quotaUsed;
    return used === undefined ? {} : { 'X-API-Quota-Used': String(used) };
  };
  const byId = new Map(
    Object.values(spec.ingredients ?? {}).map((entry) => [entry.id, entry.consistency ?? null])
  );

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, headers: { ...((init?.headers ?? {}) as Record<string, string>) } });
    const headers = quotaHeaders();
    if (spec.failWith !== undefined) {
      return new Response('blocked', { status: spec.failWith, headers });
    }

    if (url.pathname === '/recipes/complexSearch') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const number = Number(url.searchParams.get('number') ?? 10);
      const all = spec.recipes ?? [];
      return Response.json(
        { results: all.slice(offset, offset + number), totalResults: all.length },
        { headers }
      );
    }
    if (url.pathname === '/recipes/convert') {
      const key = `${url.searchParams.get('ingredientName')}:${url.searchParams.get('sourceUnit')}`;
      const grams = spec.gramsPerUnit?.[key];
      return Response.json(grams === undefined ? {} : { targetAmount: grams }, { headers });
    }
    if (url.pathname === '/food/ingredients/search') {
      const entry = spec.ingredients?.[url.searchParams.get('query') ?? ''];
      return Response.json({ results: entry ? [{ id: entry.id }] : [] }, { headers });
    }
    const idMatch = /^\/food\/ingredients\/(\d+)\/information$/.exec(url.pathname);
    if (idMatch) {
      return Response.json({ consistency: byId.get(Number(idMatch[1])) ?? undefined }, { headers });
    }
    throw new Error(`no fake for ${url.pathname}`);
  }) as typeof fetch;

  return { fetchImpl, requests };
}

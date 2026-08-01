/**
 * A fetch-boundary fake for the Spoonacular endpoints the quantity ladder
 * uses: Convert Amounts, ingredient search, and ingredient information.
 * Ingredients absent from `ingredients` search as unknown; Convert answers
 * `gramsPerUnit["<name>:<sourceUnit>"]` (Convert never refuses — a missing
 * entry answers with no number, the way the real API answers junk). Set
 * `failWith` to make every endpoint an HTTP error. Records request URLs.
 */
export function spoonacularFetchFake(spec: {
  ingredients?: Record<string, { id: number; consistency?: 'liquid' | 'solid' }>;
  gramsPerUnit?: Record<string, number>;
  failWith?: number;
}) {
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const byId = new Map(
    Object.values(spec.ingredients ?? {}).map((entry) => [entry.id, entry.consistency ?? null])
  );

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, headers: { ...((init?.headers ?? {}) as Record<string, string>) } });
    if (spec.failWith !== undefined) return new Response('blocked', { status: spec.failWith });

    if (url.pathname === '/recipes/convert') {
      const key = `${url.searchParams.get('ingredientName')}:${url.searchParams.get('sourceUnit')}`;
      const grams = spec.gramsPerUnit?.[key];
      return Response.json(grams === undefined ? {} : { targetAmount: grams });
    }
    if (url.pathname === '/food/ingredients/search') {
      const entry = spec.ingredients?.[url.searchParams.get('query') ?? ''];
      return Response.json({ results: entry ? [{ id: entry.id }] : [] });
    }
    const idMatch = /^\/food\/ingredients\/(\d+)\/information$/.exec(url.pathname);
    if (idMatch) {
      return Response.json({ consistency: byId.get(Number(idMatch[1])) ?? undefined });
    }
    throw new Error(`no fake for ${url.pathname}`);
  }) as typeof fetch;

  return { fetchImpl, requests };
}

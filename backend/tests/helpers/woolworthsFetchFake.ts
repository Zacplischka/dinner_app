import { readFileSync } from 'node:fs';

export const coriander = JSON.parse(
  readFileSync(new URL('../fixtures/woolworths/search-coriander.json', import.meta.url), 'utf8')
) as Record<string, unknown>;

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * A fetch-boundary fake for the Woolworths endpoints: answers the seed GET
 * with cookies and the search POST from `answers` (a JSON body per term, or
 * a number for an HTTP error status). Records every request.
 */
export function woolworthsFetchFake(answers: Record<string, unknown | number>) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    );
    const request: RecordedRequest = { url, method: init?.method ?? 'GET', headers };
    if (typeof init?.body === 'string') request.body = JSON.parse(init.body);
    requests.push(request);

    if (url.includes('/shop/search/products')) {
      return new Response('<html></html>', {
        status: 200,
        headers: [
          ['set-cookie', 'ak_bmsc=seed-token; Path=/; Secure'],
          ['set-cookie', 'bff_region=syd2; Path=/'],
        ],
      });
    }

    const term = (request.body as { SearchTerm?: string } | undefined)?.SearchTerm ?? '';
    const answer = answers[term];
    if (typeof answer === 'number') return new Response('blocked', { status: answer });
    if (answer === undefined) throw new Error(`no fixture for term "${term}"`);
    return Response.json(answer);
  }) as typeof fetch;

  return { fetchImpl, requests };
}

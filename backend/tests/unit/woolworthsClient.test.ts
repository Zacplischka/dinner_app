import { describe, expect, it } from 'vitest';
import { createWoolworthsClient } from '../../src/services/woolworthsClient.js';
import { coriander, woolworthsFetchFake } from '../helpers/woolworthsFetchFake.js';

describe('createWoolworthsClient', () => {
  it('parses the answer into top-5 products with cents prices and taxonomy signal', async () => {
    const { fetchImpl } = woolworthsFetchFake({ coriander });
    const { storeId, products } = await createWoolworthsClient(fetchImpl).search('coriander');

    expect(storeId).toBe(1101);
    expect(products).toHaveLength(5); // sixth result trimmed
    expect(products[0]).toEqual({
      stockcode: 144329,
      name: 'Coriander Bunch',
      brand: 'Fresh',
      packageSize: 'Each',
      priceCents: 250,
      instorePriceCents: 250,
      cupString: '$2.50 / 1EA',
      available: true,
      sapCategory: 'VEG / FRESHCUTS',
      sapSubCategory: 'HERBS',
    });
    // Divergent instore price survives as data; junk keeps its missing sapcat.
    expect(products[1].instorePriceCents).toBe(400);
    expect(products[2].sapCategory).toBeUndefined();
    // Unavailable and priceless: carried, not invented.
    expect(products[3]).toMatchObject({
      available: false,
      priceCents: undefined,
      instorePriceCents: undefined,
    });
  });

  it('carries identity on every request: pinned UA, From, X-Requested-With, seeded cookies', async () => {
    const { fetchImpl, requests } = woolworthsFetchFake({ coriander });
    const client = createWoolworthsClient(fetchImpl);
    await client.search('coriander');
    await client.search('coriander');

    const seeds = requests.filter((request) => request.method === 'GET');
    const searches = requests.filter((request) => request.method === 'POST');
    expect(seeds).toHaveLength(1); // one seed serves the whole session
    expect(searches).toHaveLength(2);
    for (const request of requests) {
      expect(request.headers['user-agent']).toMatch(/^Mozilla\/5\.0/);
      expect(request.headers.from).toBe('zacplischka@gmail.com');
      expect(request.headers['x-requested-with']).toMatch(/^Dinder\/1\.0/);
    }
    expect(searches[0].headers.cookie).toBe('ak_bmsc=seed-token; bff_region=syd2');
    expect(searches[0].body).toMatchObject({ SearchTerm: 'coriander', PageNumber: 1 });
  });

  it('returns an empty product list for a clean zero-result answer', async () => {
    const { fetchImpl } = woolworthsFetchFake({
      wombok: { SearchResultsCount: 0, Products: null },
    });
    const { products } = await createWoolworthsClient(fetchImpl).search('wombok');
    expect(products).toEqual([]);
  });

  it('throws on an HTTP error or unusable body, and re-seeds after a failure', async () => {
    const { fetchImpl, requests } = woolworthsFetchFake({ blocked: 403, coriander });
    const client = createWoolworthsClient(fetchImpl);

    await expect(client.search('blocked')).rejects.toThrow('403');
    await client.search('coriander');
    expect(requests.filter((request) => request.method === 'GET')).toHaveLength(2);

    const { fetchImpl: unusableFetch } = woolworthsFetchFake({ weird: { NotProducts: true } });
    await expect(createWoolworthsClient(unusableFetch).search('weird')).rejects.toThrow(
      'unusable body'
    );
  });
});

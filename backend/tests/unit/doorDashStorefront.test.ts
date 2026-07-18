import { describe, expect, it } from 'vitest';
import doorDashFixture from '../fixtures/comparison/doordash-search-11-inch-pizza.json';
import { doorDashStorefront } from '../../src/services/doorDashStorefront.js';

const DOORDASH_URL = 'https://www.doordash.com/store/30221303/';
const venue = {
  placeId: 'place-1',
  name: '11 Inch Pizza',
  address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
  latitude: -37.8156,
  longitude: 144.9631,
};
const actorOptions = {
  maxStores: 1,
  includeMenu: true,
  includeBusiness: false,
  includeReviews: false,
  proxy: {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'AU',
  },
};

describe('doorDashStorefront', () => {
  it('builds the search-mode actor input from the Venue delivery area', () => {
    expect(doorDashStorefront.searchInput(venue)).toEqual({
      mode: 'search',
      search: ['11 Inch Pizza'],
      location: 'Melbourne VIC 3000, Australia',
      storeType: 'restaurant',
      maxPages: 1,
      ...actorOptions,
    });
  });

  it('builds the URL-mode actor input from a stored store URL', () => {
    expect(doorDashStorefront.urlInput(DOORDASH_URL)).toEqual({
      mode: 'url',
      urls: [DOORDASH_URL],
      ...actorOptions,
    });
  });

  it('captures the real Australian menu', () => {
    const capture = doorDashStorefront.resolve(doorDashFixture, venue);

    expect(capture).toMatchObject({ status: 'resolved', storeUrl: DOORDASH_URL, deals: [] });
    expect(capture.menu).toHaveLength(60);
    expect(capture.menu).toContainEqual({
      name: 'Margherita',
      price_cents: 2300,
      section: 'Pizza',
      tags: [],
    });
  });

  it('skips noisy rows and normalizes the store URL', () => {
    const valid = { ...doorDashFixture[0], url: `${DOORDASH_URL}?delivery=true` };

    expect(doorDashStorefront.resolve([null, { name: 'partial' }, valid], venue)).toMatchObject({
      status: 'resolved',
      storeUrl: DOORDASH_URL,
    });
  });

  it.each([
    ['wrong name', { name: 'Different Restaurant' }],
    ['more than 100m away', { latitude: -37.9, longitude: 145.1 }],
    ['non-AUD currency', { currency: 'USD' }],
    ['off-domain URL', { url: 'https://example.com/store/30221303/' }],
    ['non-HTTPS URL', { url: 'http://www.doordash.com/store/30221303/' }],
  ])('rejects a Storefront with a %s', (_case, overrides) => {
    expect(doorDashStorefront.resolve([{ ...doorDashFixture[0], ...overrides }], venue)).toEqual({
      status: 'not_found',
      deals: [],
      menu: [],
    });
  });

  it('returns not_found for an empty actor output', () => {
    expect(doorDashStorefront.resolve([], venue)).toEqual({
      status: 'not_found',
      deals: [],
      menu: [],
    });
  });

  it('throws when a matching Storefront has an invalid menu', () => {
    expect(() =>
      doorDashStorefront.resolve([{ ...doorDashFixture[0], menu: null }], venue)
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import uberEatsFixture from '../fixtures/comparison/ubereats-search-11-inch-pizza.json';
import { uberEatsStorefront } from '../../src/services/uberEatsStorefront.js';

const venue = {
  placeId: 'place-1',
  name: '11 Inch Pizza',
  address: '7A/353 Little Collins St, Melbourne VIC 3000, Australia',
  latitude: -37.8156,
  longitude: 144.9631,
};

describe('uberEatsStorefront', () => {
  it('builds the search-mode actor input from the Venue delivery area', () => {
    expect(uberEatsStorefront.searchInput(venue)).toEqual({
      address: 'Melbourne VIC 3000, Australia',
      addressCountry: 'AU',
      query: '11 Inch Pizza',
      storeType: 'RESTAURANTS',
      maxRows: 5,
      locale: 'en-AU',
      getMenuCustomizations: false,
    });
  });

  it('builds the URL-mode actor input from a stored store URL', () => {
    const storeUrl = 'https://ubereats.com/au/store/11-inch-pizza/BGKvxIwATuWgM-xVHJE2lA';
    expect(uberEatsStorefront.urlInput(storeUrl)).toEqual({
      urls: [storeUrl],
      locale: 'en-AU',
      getMenuCustomizations: false,
    });
  });

  it('resolves and slims the real capture', () => {
    const capture = uberEatsStorefront.resolve(uberEatsFixture, venue);

    expect(capture).toMatchObject({
      status: 'resolved',
      storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/BGKvxIwATuWgM-xVHJE2lA',
      imageUrl:
        'https://tb-static.uber.com/prod/image-proc/processed_images/5caa3a15cf57d547ded1d89463708086/885ba8620d45ab36746a0e8c7b85ee66.jpeg',
      deals: ['Buy 1, get 1 free', '20% off', 'Earn $3 Uber Cash for photo'],
    });
    expect(capture.menu).toHaveLength(51);
    expect(capture.menu).toContainEqual({
      name: 'Margherita',
      price_cents: 2300,
      section: 'Pizza',
      tags: ['No. 1 most liked', '20% off'],
    });
    expect(capture.menu).toContainEqual({
      name: 'Coke (Can)',
      price_cents: 700,
      section: 'Drinks',
      tags: ['Buy 1, get 1 free'],
    });
  });

  it('drops a non-HTTPS hero image instead of failing the capture', () => {
    const capture = uberEatsStorefront.resolve(
      [{ ...uberEatsFixture[0], heroImageUrl: 'http://tb-static.uber.com/hero.jpeg' }],
      venue
    );

    expect(capture.status).toBe('resolved');
    expect(capture.imageUrl).toBeUndefined();
  });

  it('treats the actor no-restaurant row as not_found', () => {
    expect(
      uberEatsStorefront.resolve([{ error: "Scraper didn't find any restaurants" }], venue)
    ).toEqual({ status: 'not_found', deals: [], menu: [] });
  });

  it.each([
    ['off-domain', 'https://example.com/au/store/11-inch-pizza'],
    ['non-HTTPS', 'http://ubereats.com/au/store/11-inch-pizza'],
    ['malformed', 'not a URL'],
  ])('throws on an unsafe store URL (%s)', (_case, url) => {
    expect(() => uberEatsStorefront.resolve([{ ...uberEatsFixture[0], url }], venue)).toThrow(
      'Uber Eats returned malformed Storefront details'
    );
  });

  it('returns not_found when no row passes the name and 100m Venue check', () => {
    const wrongVenue = [
      {
        ...uberEatsFixture[0],
        title: 'Different Pizza Shop',
        location: { ...uberEatsFixture[0].location, latitude: -37.9, longitude: 145.1 },
      },
    ];

    expect(uberEatsStorefront.resolve(wrongVenue, venue)).toEqual({
      status: 'not_found',
      deals: [],
      menu: [],
    });
  });
});

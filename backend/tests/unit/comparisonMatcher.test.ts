import { describe, expect, it } from 'vitest';
import type { MenuItemCapture, Snapshot } from '@dinder/shared/types';
import {
  deriveComparison,
  normalizeComparisonName,
} from '../../src/services/comparisonMatcher.js';

function snapshot(
  uberEatsMenu: MenuItemCapture[],
  doorDashMenu: MenuItemCapture[]
): Snapshot {
  return {
    id: 'snapshot-1',
    placeId: 'place-1',
    venueName: 'Pizza Place',
    fetchedAt: '2026-07-13T08:00:00.000Z',
    payload: {
      ubereats: { status: 'resolved', deals: [], menu: uberEatsMenu },
      doordash: { status: 'resolved', deals: [], menu: doorDashMenu },
    },
  };
}

describe('deriveComparison', () => {
  it('exposes the one normalization rule shared by Venue and item matching', () => {
    expect(normalizeComparisonName('  Café & GARLIC-BREAD!! ')).toBe('café garlic bread');
  });

  it('matches normalized names one-to-one and leaves the Snapshot captures untouched', () => {
    const source = snapshot(
      [
        { name: 'Margherita (Large)!', price_cents: 2000, section: 'Pizza', tags: [] },
        { name: 'GARLIC-BREAD', price_cents: 800, tags: [] },
        { name: 'Uber only', price_cents: 900, tags: [] },
      ],
      [
        { name: 'margherita large', price_cents: 2200, section: 'Pizzas', tags: [] },
        { name: 'Garlic Bread', price_cents: 700, tags: [] },
        { name: 'DoorDash only', price_cents: 1000, tags: [] },
      ]
    );
    const originalPayload = structuredClone(source.payload);

    const comparison = deriveComparison(source);

    expect(comparison.matchedItems).toHaveLength(2);
    expect(comparison.matchedItems[0]).toEqual({
      name: 'Margherita (Large)!',
      ubereats: source.payload.ubereats?.menu[0],
      doordash: source.payload.doordash?.menu[0],
    });
    expect(comparison.unmatched).toEqual({
      ubereats: [source.payload.ubereats?.menu[2]],
      doordash: [source.payload.doordash?.menu[2]],
    });
    expect(comparison.cheaperMenu).toBeUndefined();
    expect(source.payload).toEqual(originalPayload);
    expect(source.payload).not.toHaveProperty('matchedItems');
  });

  it('reports the median pairwise percentage instead of an outlier-skewed average', () => {
    const names = ['A', 'B', 'C', 'D', 'Outlier'];
    const source = snapshot(
      names.map((name, index) => ({
        name,
        price_cents: index === 4 ? 100 : 900,
        tags: [],
      })),
      names.map((name) => ({ name, price_cents: 1000, tags: [] }))
    );

    expect(deriveComparison(source).cheaperMenu).toEqual({
      platform: 'ubereats',
      percent: 10,
    });
  });

  it('omits the percentage below three matches and supports DoorDash as cheaper', () => {
    const twoMatches = snapshot(
      [
        { name: 'A', price_cents: 1000, tags: [] },
        { name: 'B', price_cents: 1000, tags: [] },
      ],
      [
        { name: 'A', price_cents: 900, tags: [] },
        { name: 'B', price_cents: 900, tags: [] },
      ]
    );
    const threeMatches = snapshot(
      ['A', 'B', 'C'].map((name) => ({ name, price_cents: 1000, tags: [] })),
      ['A', 'B', 'C'].map((name) => ({ name, price_cents: 900, tags: [] }))
    );

    expect(deriveComparison(twoMatches).cheaperMenu).toBeUndefined();
    expect(deriveComparison(threeMatches).cheaperMenu).toEqual({
      platform: 'doordash',
      percent: 10,
    });
  });

  it('keeps duplicate normalized names as distinct one-to-one pairs', () => {
    const source = snapshot(
      [
        { name: 'Combo Deal', price_cents: 1000, tags: [] },
        { name: 'Combo Deal', price_cents: 2000, tags: [] },
      ],
      [
        { name: 'combo deal', price_cents: 1100, tags: [] },
        { name: 'combo deal', price_cents: 2200, tags: [] },
      ]
    );

    const comparison = deriveComparison(source);

    expect(comparison.matchedItems).toHaveLength(2);
    expect(comparison.unmatched).toEqual({ ubereats: [], doordash: [] });
  });
});

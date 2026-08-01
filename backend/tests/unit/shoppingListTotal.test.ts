// The list total and what the headline says about it (#234's rule 4). The
// same arithmetic serves every per-Shopper Tally (#263), so it is a pure
// function over any subset of lines.
import { describe, expect, it } from 'vitest';
import { shoppingListTotal, type ShoppingListLine } from '@dinder/shared/types';

const product = { stockcode: 1, name: 'Woolworths Diced Tomatoes', packageSize: '400g' };

const priced = (id: string, priceCents: number, staple = false): ShoppingListLine => ({
  id,
  text: `line ${id}`,
  staple,
  state: 'priced',
  needs: { amount: 250, unit: 'g' },
  packs: 1,
  priceCents,
  product,
});

const estimated = (id: string, priceCents: number): ShoppingListLine => ({
  id,
  text: `line ${id}`,
  staple: false,
  state: 'estimated',
  needs: { amount: 600, unit: 'g' },
  priceCents,
  product,
});

const unpricedMatched = (id: string): ShoppingListLine => ({
  id,
  text: `line ${id}`,
  staple: false,
  state: 'unpriced_matched',
  product,
});

const unmatched = (id: string, staple = false): ShoppingListLine => ({
  id,
  text: `line ${id}`,
  staple,
  state: 'unmatched',
  searchTerm: 'coriander',
});

describe('shoppingListTotal', () => {
  it('sums the Priced lines exactly, with no ≈ and nothing left out', () => {
    expect(shoppingListTotal([priced('0', 140), priced('1', 360)])).toEqual({
      cents: 500,
      estimated: false,
      unpricedCount: 0,
    });
  });

  it('inherits the ≈ the moment an Estimated line enters the sum', () => {
    const total = shoppingListTotal([priced('0', 140), estimated('1', 774)]);
    expect(total).toEqual({ cents: 914, estimated: true, unpricedCount: 0 });
  });

  it('counts the two out-of-tally states instead of pricing them', () => {
    const total = shoppingListTotal([priced('0', 140), unpricedMatched('1'), unmatched('2')]);
    expect(total).toEqual({ cents: 140, estimated: false, unpricedCount: 2 });
  });

  it('leaves Staples out of the total and out of the unpriced count', () => {
    const total = shoppingListTotal([
      priced('0', 140),
      priced('1', 999, true),
      unmatched('2', true),
    ]);
    expect(total).toEqual({ cents: 140, estimated: false, unpricedCount: 0 });
  });

  it('is zero and exact for an empty list, not an estimate of nothing', () => {
    expect(shoppingListTotal([])).toEqual({ cents: 0, estimated: false, unpricedCount: 0 });
  });
});

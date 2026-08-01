import { describe, expect, it } from 'vitest';
import { matchProducts, type WoolworthsProduct } from '../../src/services/productMatcher.js';

function product(overrides: Partial<WoolworthsProduct> & { stockcode: number }): WoolworthsProduct {
  return {
    name: 'Product',
    available: true,
    priceCents: 300,
    sapCategory: 'COOKING NEEDS',
    ...overrides,
  };
}

describe('matchProducts', () => {
  it('returns the match plus runner-ups for the swap picker', () => {
    const result = matchProducts(
      [
        product({ stockcode: 1, name: 'Coriander Bunch', sapCategory: 'VEG / FRESHCUTS' }),
        product({ stockcode: 2, name: 'Coriander Dried Herbs' }),
        product({ stockcode: 3, name: 'Parsley Bunch', sapCategory: 'VEG / FRESHCUTS' }),
      ],
      'coriander'
    );

    expect(result?.match.stockcode).toBe(1);
    expect(result?.runnersUp.map((candidate) => candidate.stockcode)).toEqual([2, 3]);
  });

  it('never surfaces marketplace junk (no SAP category) as a candidate', () => {
    // The #243 heavy-cream failure mode: hair treatment and novelty imports.
    const result = matchProducts(
      [
        product({ stockcode: 1, name: 'Redken All Soft Heavy Cream', sapCategory: undefined }),
        product({ stockcode: 2, name: 'Weighted Blanket', sapCategory: undefined }),
        product({ stockcode: 3, name: 'Thickened Cream 300ml', sapCategory: 'DAIRY' }),
      ],
      'thickened cream'
    );

    expect(result?.match.stockcode).toBe(3);
    expect(result?.runnersUp).toEqual([]);
  });

  it('treats an all-junk answer as a clean miss (the sapcat guard)', () => {
    expect(
      matchProducts(
        [
          product({ stockcode: 1, name: 'Baby Powder', sapCategory: 'BABY CARE' }),
          product({ stockcode: 2, name: 'Shower Caps', sapCategory: undefined }),
        ],
        'cornflour'
      )
    ).toBeNull();
    expect(matchProducts([], 'napa cabbage')).toBeNull();
  });

  it('blocks snack sections at SAP level but not "Chips" inside legitimate category paths', () => {
    // #245's store-1101 tuning: taco shells were falsely Unmatched because
    // every candidate's pies path contains "Chips"; SNACKS won sour cream.
    const result = matchProducts(
      [
        product({ stockcode: 1, name: 'Sakata Rice Crackers', sapCategory: 'SNACKS' }),
        product({ stockcode: 2, name: 'Sour Cream 300g', sapCategory: 'DAIRY' }),
        product({ stockcode: 3, name: 'Arnotts Biscuits', sapCategory: 'BISCUITS' }),
      ],
      'sour cream'
    );
    expect(result?.match.stockcode).toBe(2);
    expect(result?.runnersUp).toEqual([]);

    const tacoShells = matchProducts(
      [product({ stockcode: 4, name: 'Mission Taco Shells', sapCategory: 'MEXICAN' })],
      'taco shells'
    );
    expect(tacoShells?.match.stockcode).toBe(4);
  });

  it('prefers the candidate whose name carries the term identity over a higher-ranked stranger', () => {
    const result = matchProducts(
      [
        product({ stockcode: 1, name: 'Vegetable Stock 1L' }),
        product({ stockcode: 2, name: 'Chicken Stock 1L' }),
      ],
      'chicken stock'
    );
    expect(result?.match.stockcode).toBe(2);
  });

  it('penalises unavailable and priceless candidates so a priceable one wins a tie', () => {
    const result = matchProducts(
      [
        product({
          stockcode: 1,
          name: 'Coriander Punnet',
          available: false,
          priceCents: undefined,
          sapCategory: 'VEG / FRESHCUTS',
        }),
        product({ stockcode: 2, name: 'Coriander Bunch', sapCategory: 'VEG / FRESHCUTS' }),
      ],
      'coriander'
    );
    expect(result?.match.stockcode).toBe(2);
  });

  it('strips the taxonomy signal fields from the wire candidates', () => {
    const result = matchProducts(
      [product({ stockcode: 1, name: 'Coriander', sapCategory: 'VEG / FRESHCUTS' })],
      'coriander'
    );
    expect(result?.match).not.toHaveProperty('sapCategory');
    expect(result?.match).not.toHaveProperty('sapSubCategory');
  });
});

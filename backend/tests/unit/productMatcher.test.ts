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

  it('keeps matching a taco-class term (#328 regression pin, not a fix)', () => {
    // #328 probed "taco shells", "tortillas", "corn tortillas" and "taco
    // seasoning" live and found them already matching: every result sits in
    // the "ETHNIC / GOURMET FOOD" section under "MEXICAN FOODS", and the
    // "Chips" that #326 feared lives only in the pies category path, which
    // #245 already put out of the blocklist's reach. Nothing here changed to
    // make this pass — it pins it so no future blocklist word evicts the
    // section. The tongs and baskets sharing the answer are marketplace
    // listings with no SAP category.
    const result = matchProducts(
      [
        product({
          stockcode: 6038264,
          name: 'Old El Paso Original Taco Shells',
          sapCategory: 'ETHNIC / GOURMET FOOD',
          sapSubCategory: 'MEXICAN FOODS',
        }),
        product({
          stockcode: 333915,
          name: 'Mission Original Tortillas',
          sapCategory: 'ETHNIC / GOURMET FOOD',
          sapSubCategory: 'MEXICAN FOODS',
        }),
        product({
          stockcode: 1123923157,
          name: 'JOYBUY 6 Pcs Taco Shell Tong with Clip',
          sapCategory: undefined,
        }),
      ],
      'taco shells'
    );

    expect(result?.match.stockcode).toBe(6038264);
    expect(result?.runnersUp.map((candidate) => candidate.stockcode)).toEqual([333915]);
  });

  it('still refuses snack, confectionery and non-food answers (#328)', () => {
    // Taken from the same probe: crisps and chocolate are named by their
    // section, while chilled dog food sits under a food section and is only
    // nameable by its sub-category — which is why the blocklist tests the two
    // concatenated. A snack sub-category under a food section goes with them
    // ("VEG / FRESHCUTS / HARD PRODUCE" -> "NUTS AND SNACKS" loses to
    // "COOKING NEEDS" -> "DRIED FRUIT & NUTS" on "peanuts"); that is the
    // known cost of keeping "snack" in, and no probed term missed because of
    // it.
    expect(
      matchProducts(
        [
          product({
            stockcode: 332426,
            name: "Smith's Thinly Cut Potato Chips Sour Cream & Onion",
            sapCategory: 'SNACKS',
            sapSubCategory: 'CHIPS - SHARING',
          }),
          product({
            stockcode: 54641,
            name: 'Woolworths Milk Chocolate Peanuts',
            sapCategory: 'CONFECTIONERY',
            sapSubCategory: 'CONFEC SHARING - CHOCOLATE',
          }),
          product({
            stockcode: 831291,
            name: 'VIP Chunkers Adult Chilled Fresh Dog Food',
            sapCategory: 'MEAT CONVENIENCE',
            sapSubCategory: 'PET NEEDS - FRESH',
          }),
        ],
        'sour cream'
      )
    ).toBeNull();
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

  it('fills the runner-up slots with available candidates only', () => {
    // #285: the picker refuses to swap onto an unavailable product, so an
    // unavailable runner-up is a slot the Shopper opens onto nothing.
    const result = matchProducts(
      [
        product({ stockcode: 1, name: 'Coriander Bunch' }),
        product({ stockcode: 2, name: 'Coriander Punnet', available: false }),
        product({ stockcode: 3, name: 'Coriander Dried' }),
        product({ stockcode: 4, name: 'Coriander Paste' }),
        product({ stockcode: 5, name: 'Coriander Seeds', available: false }),
        product({ stockcode: 6, name: 'Coriander Frozen' }),
        product({ stockcode: 7, name: 'Coriander Seedling' }),
      ],
      'coriander'
    );

    expect(result?.match.stockcode).toBe(1);
    // Four slots, none wasted: the unavailable 2 and 5 are skipped and the
    // deeper 6 and 7 fill in.
    expect(result?.runnersUp.map((candidate) => candidate.stockcode)).toEqual([3, 4, 6, 7]);
  });

  it('strips the cached-record-only fields from the wire candidates', () => {
    const result = matchProducts(
      [
        product({
          stockcode: 1,
          name: 'Coriander',
          sapCategory: 'VEG / FRESHCUTS',
          instorePriceCents: 250,
        }),
      ],
      'coriander'
    );
    expect(result?.match).not.toHaveProperty('sapCategory');
    expect(result?.match).not.toHaveProperty('sapSubCategory');
    expect(result?.match).not.toHaveProperty('instorePriceCents');
  });
});

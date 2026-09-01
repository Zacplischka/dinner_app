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

  it('matches a taco-class term against the Mexican-foods aisle (#328)', () => {
    // Measured live: every taco shell and tortilla Woolworths returns sits in
    // "ETHNIC / GOURMET FOOD" -> "MEXICAN FOODS", and the tongs and fryer
    // baskets sharing the answer are marketplace listings with no SAP
    // category. The blocklist must never grow a word that evicts this aisle.
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

  it('lets a snack-food shelf label inside an ingredient aisle survive (#328)', () => {
    // Measured live on "peanuts": the produce aisle shelves its nuts under
    // "NUTS AND SNACKS", so testing the blocklist against aisle + shelf
    // together threw away the whole produce aisle. The snack *aisle* itself
    // still goes (#245: SNACKS beats real sour cream at store 1101).
    const result = matchProducts(
      [
        product({
          stockcode: 598179,
          name: 'Woolworths Peanuts Unsalted',
          sapCategory: 'SNACKS',
          sapSubCategory: 'SNACK - NUTS & MEAT SNACKS',
        }),
        product({
          stockcode: 185221,
          name: 'Woolworths Peanuts Roasted & Salted',
          sapCategory: 'VEG / FRESHCUTS / HARD PRODUCE',
          sapSubCategory: 'NUTS AND SNACKS',
        }),
        product({
          stockcode: 89762,
          name: 'Woolworths Blanched Peanuts',
          sapCategory: 'COOKING NEEDS',
          sapSubCategory: 'DRIED FRUIT & NUTS',
        }),
      ],
      'peanuts'
    );

    expect(result?.match.stockcode).toBe(185221);
    expect(result?.runnersUp.map((candidate) => candidate.stockcode)).toEqual([89762]);
  });

  it('still refuses snack, confectionery and non-food shelves (#328)', () => {
    // The other half of the aisle-aware split, all measured live: crisps and
    // chocolate blocks are whole aisles, while chilled dog food hides under a
    // food aisle and is only nameable by its shelf.
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

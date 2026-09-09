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
  it.each(['1L', '10 pack'])(
    'keeps full ingredient identity when a lower-identity %s product starts first',
    (packageSize) => {
      const rows = [
        product({ stockcode: 1, name: 'Chicken Stock', packageSize }),
        product({ stockcode: 2, name: 'Vegetable Stock Cubes', packageSize: '10 pack' }),
      ];
      expect(matchProducts(rows, 'vegetable stock')?.match.stockcode).toBe(2);
      expect(matchProducts(rows, 'vegetable stock', 'volume')?.match.stockcode).toBe(2);
    }
  );

  it('preserves earlier fuller-identity ties without promoting later fuller-identity ties', () => {
    const term = 'alpha bravo charlie delta echo foxtrot golf hotel';
    const fillers = Array.from({ length: 4 }, (_, index) =>
      product({ stockcode: 10 + index, sapCategory: undefined })
    );
    const fullerFirst = [
      product({ stockcode: 1, name: term, packageSize: '10 pack', available: false }),
      ...fillers,
      product({
        stockcode: 2,
        name: 'alpha bravo charlie delta echo foxtrot golf',
        packageSize: '1L',
      }),
    ];
    const fullerLast = [
      product({ stockcode: 2, name: 'alpha', packageSize: '1L' }),
      ...fillers,
      product({ stockcode: 1, name: term, packageSize: '10 pack' }),
    ];
    for (const rows of [fullerFirst, fullerLast]) {
      expect(matchProducts(rows, term, 'volume')?.match.stockcode).toBe(
        matchProducts(rows, term)?.match.stockcode
      );
    }
  });

  it.each([
    ['CAT', 'FOOD & LITTER'],
    ['BABY', 'CARE'],
    ['SOFT', 'DRINKS'],
  ])(
    'still blocks phrases spanning category %s and subcategory %s',
    (sapCategory, sapSubCategory) => {
      expect(
        matchProducts([product({ stockcode: 1, sapCategory, sapSubCategory })], 'food')
      ).toBeNull();
    }
  );

  it('recognizes the measured water shelf regardless of casing and surrounding whitespace', () => {
    const water = product({
      stockcode: 1,
      name: 'Coconut Water',
      packageSize: '1L',
      sapCategory: ' lifestyle/water non carbonated ',
      sapSubCategory: ' Soft Drinks - Water ',
    });
    expect(matchProducts([water], 'coconut water', 'volume')?.match.stockcode).toBe(1);
  });

  it('keeps a blocked root blocked even with a nuts subcategory', () => {
    const snack = product({
      stockcode: 1,
      sapCategory: 'VEG / SNACKS',
      sapSubCategory: 'NUTS AND SNACKS',
    });
    expect(matchProducts([snack], 'nuts', 'mass')).toBeNull();
  });

  it('keeps count against mass neutral because the ladder can convert pieces to grams', () => {
    const rows = [
      product({ stockcode: 1, name: 'Onions', packageSize: '1kg' }),
      product({ stockcode: 2, name: 'Onions', packageSize: 'each' }),
    ];
    expect(matchProducts(rows, 'onions', 'count')).toEqual(matchProducts(rows, 'onions'));
  });

  // #367: store 1101 names, sections, packs and original ranks from the ticket;
  // stockcodes are synthetic. No retailer request is made by these regressions.
  it('prefers a loose lemon to the higher-ranked dressing and drink for a count line', () => {
    const rows = [
      [
        'Remedy Sodaly Yuzu Lemon',
        'CARBONATED SOFT DRINKS',
        'SOFT DRINKS - MIXERS',
        '250mL x 4 pack',
      ],
      [
        'Fever-Tree Sicilian Lemon Soda',
        'CARBONATED SOFT DRINKS',
        'SOFT DRINKS - MIXERS',
        '250mL x 4 pack',
      ],
      [
        'Birch & Waite Greek Lemon Dressing',
        'VEG / FRESHCUTS / HARD PRODUCE',
        'CONDIMENTS & HERBS',
        '250mL',
      ],
      [
        'Remedy Sodaly Yuzu Lemon',
        'DAIRY - CHILLED JUICES & DRINKS',
        'DAIRY - CHILLED JUICES & DRINKS',
        '330mL',
      ],
      ['Lemon Loose', 'FRUIT', 'CITRUS', 'each'],
      ['The Odd Bunch Lemon Prepacked', 'FRUIT', 'CITRUS', '500g'],
      ['Lemon Lemon Bag', 'FRUIT', 'CITRUS', '500g'],
      ['Woolworths Lemon Juice', 'CONDIMENTS', 'SAUCES', '250mL'],
      ['Sun Harvest Lemon Juice', 'CONDIMENTS', 'SAUCES', '500mL'],
      ['Woolworths Lemon Juice', 'CONDIMENTS', 'SAUCES', '200mL'],
    ].map(([name, sapCategory, sapSubCategory, packageSize], stockcode) =>
      product({ stockcode, name, sapCategory, sapSubCategory, packageSize })
    );
    expect(matchProducts(rows, 'lemon')?.match.stockcode).toBe(2);
    expect(matchProducts(rows, 'lemon', 'count')?.match.stockcode).toBe(4);
  });

  it('refuses vitamin gummies even when they lead real vinegar in the search answer', () => {
    const gummies = [45, 90].map((count, stockcode) =>
      product({
        stockcode,
        name: 'Swisse Apple Cider Vinegar + Fibre Gummies',
        sapCategory: 'HEALTH CARE',
        sapSubCategory: 'VITAMINS',
        packageSize: `${count} pack`,
      })
    );
    const vinegar = product({
      stockcode: 2,
      name: 'Macro Organic Apple Cider Vinegar',
      sapCategory: 'CONDIMENTS',
      sapSubCategory: 'VINEGAR MAYO & DRESSINGS',
      packageSize: '500mL',
    });
    const pantry = product({
      stockcode: 3,
      name: 'Bragg Apple Cider Vinegar',
      sapCategory: 'HEALTH FOODS',
      sapSubCategory: 'HEALTH FOOD PANTRY',
      packageSize: '946mL',
    });
    const result = matchProducts([...gummies, vinegar, pantry], 'apple cider vinegar', 'volume');
    expect(result?.match.stockcode).toBe(2);
    expect(result?.runnersUp.map((p) => p.stockcode)).toEqual([3]);
    expect(matchProducts(gummies, 'apple cider vinegar', 'volume')).toBeNull();
  });

  it('matches the only produce-shelf unsalted cashews instead of declaring them not ranged', () => {
    const result = matchProducts(
      [
        product({
          stockcode: 1,
          name: 'Woolworths Cashews Roasted & Unsalted',
          packageSize: '750g',
          sapCategory: 'VEG / FRESHCUTS / HARD PRODUCE',
          sapSubCategory: 'NUTS AND SNACKS',
        }),
      ],
      'cashews unsalted',
      'mass'
    );
    expect(result?.match.stockcode).toBe(1);
  });

  it.each(['mass', 'volume'] as const)('demotes count packs for a %s line', (form) => {
    const rows = [
      product({ stockcode: 1, name: 'Pumpkin Whole', packageSize: 'each' }),
      product({ stockcode: 2, name: 'Pumpkin Cut', packageSize: '500g' }),
    ];
    expect(matchProducts(rows, 'pumpkin', form)?.match.stockcode).toBe(2);
  });

  it('leaves mass against volume neutral for the ladder to check liquid consistency', () => {
    const rows = [
      product({ stockcode: 1, name: 'Coconut Milk', packageSize: '400mL' }),
      product({ stockcode: 2, name: 'Coconut Milk', packageSize: '400g' }),
    ];
    expect(matchProducts(rows, 'coconut milk', 'mass')).toEqual(
      matchProducts(rows, 'coconut milk')
    );
    expect(matchProducts(rows, 'coconut milk', 'mass')?.match.stockcode).toBe(1);
  });

  it('caps a demotion below one identity keyword and applies it only once', () => {
    const rows = [
      product({
        stockcode: 1,
        name: 'Cashews Unsalted',
        packageSize: 'each',
        sapCategory: 'VEG / FRESHCUTS / HARD PRODUCE',
        sapSubCategory: 'NUTS AND SNACKS',
      }),
      product({ stockcode: 2, name: 'Cashews Salted', packageSize: '750g' }),
    ];
    expect(matchProducts(rows, 'cashews unsalted', 'mass')?.match.stockcode).toBe(1);
  });

  it.each([undefined, 'unknown size', 'per 190g', '750g - 2.2kg'])(
    'leaves %s packs neutral',
    (packageSize) => {
      const rows = [
        product({ stockcode: 1, name: 'Lemon', packageSize }),
        product({ stockcode: 2, name: 'Lemon Loose', packageSize: 'each' }),
      ];
      expect(matchProducts(rows, 'lemon', 'count')).toEqual(matchProducts(rows, 'lemon'));
    }
  );

  it.each([
    ['coconut water', 'LIFESTYLE/WATER NON CARBONATED', 'SOFT DRINKS - WATER', '1L'],
    ['tomato juice', 'LONGLIFE JUICE / DRINKS', 'FRUIT JUICE - LONG LIFE', '1L'],
    ['coconut milk', 'ETHNIC / GOURMET FOOD', 'ASIAN FOODS', '400mL'],
  ])(
    'retains the rank-zero %s as a cooking ingredient',
    (name, sapCategory, sapSubCategory, packageSize) => {
      const rows = [
        product({ stockcode: 1, name, sapCategory, sapSubCategory, packageSize }),
        product({ stockcode: 2, name, sapCategory, sapSubCategory, packageSize }),
      ];
      expect(matchProducts(rows, name, 'volume')?.match.stockcode).toBe(1);
    }
  );

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
    // Provenance: probed from a dev-machine egress with FulfilmentStoreId null
    // on every answer, so these are some Woolworths store's section strings and
    // not store-1101 verified (#328 AC3 open — ADR 0010 makes every gate
    // measured here a this-store gate, and catalogue does move between stores).
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
    // Taken from the same probe, same provenance caveat: dev-machine egress,
    // FulfilmentStoreId null, not store-1101 verified. Crisps and chocolate are
    // named by their section, while chilled dog food sits under a food section
    // and is only nameable by its sub-category — which is why the blocklist
    // tests the two concatenated. The cost of testing both is pinned in the
    // next case.
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

  it('prefers cooking-aisle peanuts while offering the produce pack as a swap (#328, #367)', () => {
    // The produce shelf is now demoted instead of evicted: the swap picker
    // should offer its legitimate 750 g pack alongside the cooking ingredient.
    const result = matchProducts(
      [
        product({
          stockcode: 1,
          name: 'Woolworths Peanuts Roasted & Salted',
          packageSize: '750g',
          sapCategory: 'VEG / FRESHCUTS / HARD PRODUCE',
          sapSubCategory: 'NUTS AND SNACKS',
        }),
        product({
          stockcode: 2,
          name: 'Woolworths Blanched Peanuts',
          packageSize: '375g',
          sapCategory: 'COOKING NEEDS',
          sapSubCategory: 'DRIED FRUIT & NUTS',
        }),
      ],
      'peanuts'
    );

    expect(result?.match.stockcode).toBe(2);
    expect(result?.runnersUp.map((candidate) => candidate.stockcode)).toEqual([1]);
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

it.each(['garlic', 'garlic cloves', 'fresh garlic'])(
  'keeps prepared garlic out of a fresh %s match and swap choices',
  (term) => {
    const result = matchProducts(
      [
        product({
          stockcode: 1,
          name: 'Gourmet Garden Cold Blend Pastes Garlic',
          sapCategory: 'VEG / FRESHCUTS',
        }),
        product({ stockcode: 2, name: 'Garlic Powder' }),
        product({ stockcode: 3, name: 'Garlic Bread', sapCategory: 'BAKERY' }),
        product({
          stockcode: 4,
          name: 'Garlic Fresh Each',
          packageSize: 'each',
          sapCategory: 'VEG / FRESHCUTS',
        }),
      ],
      term
    );
    expect(result?.match.stockcode).toBe(4);
    expect(result?.runnersUp).toEqual([]);
    expect(matchProducts([product({ stockcode: 1, name: 'Garlic Paste' })], term)).toBeNull();
  }
);

it.each(['garlic paste', 'crushed garlic', 'garlic powder'])(
  'still matches explicitly requested %s',
  (term) => {
    expect(matchProducts([product({ stockcode: 1, name: term })], term)?.match.stockcode).toBe(1);
  }
);

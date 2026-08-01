// The Staples (#229, #234): a small hardcoded set of ingredients assumed
// already at home. A Staple is still an Ingredient Line — visible, claimable —
// but rendered unticked and excluded from the list total, every Tally, and the
// coverage count. Ships as data, exactly as the spec calls for; no lookup, no
// per-user pantry, nothing to configure.
//
// Entries are deliberately spelled out rather than left as bare head words
// ("white vinegar", not "vinegar"; "plain flour", not "flour"), because a
// Staple that swallows balsamic or almond flour leaves them off the shop.

const STAPLES = [
  'salt',
  'sea salt',
  'table salt',
  'kosher salt',
  'pepper',
  'black pepper',
  'white pepper',
  'peppercorns',
  'olive oil',
  'extra virgin olive oil',
  'vegetable oil',
  'canola oil',
  'sunflower oil',
  'cooking oil',
  'cooking spray',
  'water',
  'cold water',
  'hot water',
  'sugar',
  'white sugar',
  'caster sugar',
  'brown sugar',
  'plain flour',
  'all purpose flour',
  'self raising flour',
  'baking powder',
  'baking soda',
  'bicarbonate of soda',
  'white vinegar',
  'soy sauce',
  'honey',
];

// Where a Staple's head word is also the head word of a real ingredient, the
// ambiguous sense falls out of the pantry rather than into it. The asymmetry
// is the point: a wrongly-priced spice costs the tally a couple of dollars, a
// swallowed capsicum leaves the dish uncookable.
const NOT_STAPLE =
  /\b(bell|red|green|yellow|orange|capsicum|chilli|chili|sweet) pepper|\bsugar snap|\bwater chestnut/;

/**
 * Whole-word phrase match on the normalized ingredient name, so "sea salt" is
 * a Staple, "salted peanuts" is not, and "watercress" is not water. Which
 * entry hits is irrelevant — any hit is the same verdict.
 */
export function isStaple(ingredientName: string): boolean {
  const normalized = ingredientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (NOT_STAPLE.test(normalized)) return false;
  return STAPLES.some((staple) => ` ${normalized} `.includes(` ${staple} `));
}

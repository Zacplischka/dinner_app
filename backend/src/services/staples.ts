// The Staples (#229, #234): a small hardcoded set of ingredients assumed
// already at home. A Staple is still an Ingredient Line — visible, claimable —
// but rendered muted in its own pantry section and excluded from the list
// total, every Tally, and the coverage count. Ships as data, exactly as the spec calls for; no lookup, no
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

// The few names where the Staple is the tail and the ingredient still isn't
// one. The asymmetry is the point: a wrongly-priced spice costs the tally a
// couple of dollars, a swallowed capsicum leaves the dish uncookable.
const NOT_STAPLE =
  /\b(bell|red|green|yellow|orange|capsicum|chilli|chili|sweet) pepper$|coconut water$/;

/**
 * A Staple has to be the *tail* of the ingredient name, not merely present in
 * it: "sea salt" and "extra virgin olive oil" are qualified staples, while
 * "honey mustard", "sugar snap peas" and "water chestnuts" are other things
 * that merely begin with one. Leading words narrow a staple; trailing words
 * make it something else. Which entry hits is irrelevant — any hit is the same
 * verdict, and the whole-word test keeps "watercress" from being water.
 */
export function isStaple(ingredientName: string): boolean {
  const normalized = ingredientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (NOT_STAPLE.test(normalized)) return false;
  return STAPLES.some((staple) => normalized === staple || normalized.endsWith(` ${staple}`));
}

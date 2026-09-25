// The Staples (#229, #234): a small hardcoded set of ingredients assumed
// already at home. A Staple is still an Ingredient Line — visible, claimable —
// but rendered muted in its own pantry section and excluded from the list
// total, every Tally, and the coverage count. Ships as data, exactly as the spec calls for; no lookup, no
// per-user pantry, nothing to configure.
//
// Entries are spelled out in full, each qualified form on its own line ("sea
// salt", "caster sugar"), because only a name that is an entry is a Staple.

const STAPLES = [
  'salt',
  'sea salt',
  'table salt',
  'kosher salt',
  'fine sea salt',
  'flaky sea salt',
  'salt and pepper',
  'salt and black pepper',
  'salt and freshly ground black pepper',
  'kosher salt and freshly ground black pepper',
  'sea salt and pepper',
  'pepper',
  'ground pepper',
  'freshly ground pepper',
  'black pepper',
  'ground black pepper',
  'freshly ground black pepper',
  'cracked black pepper',
  'white pepper',
  'peppercorns',
  'black peppercorns',
  'olive oil',
  'extra virgin olive oil',
  'vegetable oil',
  'canola oil',
  'sunflower oil',
  'cooking oil',
  'cooking spray',
  'nonstick cooking spray',
  'water',
  'cold water',
  'hot water',
  'warm water',
  'boiling water',
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

/**
 * A Staple is a name that *is* one of the entries, once case and punctuation
 * are set aside and "&" reads as "and": "Extra-virgin olive oil" and "salt &
 * pepper" are, "tuna in olive oil", "palm sugar" and "jalapeno pepper" are not
 * (#504). A name that merely ends in a Staple is usually the main ingredient,
 * and muting it leaves the dish off its own list; a qualified form worth
 * muting is spelled out above instead.
 */
export function isStaple(ingredientName: string): boolean {
  return STAPLES.includes(
    ingredientName
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

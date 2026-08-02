// US→AU ingredient vocabulary, translated *before* Woolworths search (#243).
// Drafted offline, human-reviewed row by row, committed as data — no model
// call at runtime. Untranslated terms pass through unchanged; misses fall to
// the Product Matcher's sapcat guard. The table grows from evidence (gate
// failures and guard trips arrive with the failing term attached), never from
// speculative vocabulary sweeps.
//
// Keys are normalized: lowercase, hyphens/whitespace collapsed to single
// spaces. Values are the literal Woolworths search term.

export const US_TO_AU_TERMS: Record<string, string> = {
  // The #231/#243 measured twelve (eggplant and zucchini needed no row)
  cilantro: 'coriander',
  'fresh cilantro': 'coriander',
  'ground beef': 'beef mince',
  'bell pepper': 'capsicum',
  'red bell pepper': 'red capsicum',
  'green bell pepper': 'green capsicum',
  'yellow bell pepper': 'yellow capsicum',
  scallion: 'spring onions',
  scallions: 'spring onions',
  'green onion': 'spring onions',
  'green onions': 'spring onions',
  'heavy cream': 'thickened cream',
  'heavy whipping cream': 'thickened cream',
  'whipping cream': 'thickened cream',
  'all purpose flour': 'plain flour',
  cornstarch: 'cornflour',
  shrimp: 'prawns',
  shrimps: 'prawns',
  arugula: 'rocket',
  'napa cabbage': 'wombok',

  // Well-attested divergences (#243's seed list)
  'half and half': 'pouring cream',
  'light cream': 'pouring cream',
  'garbanzo beans': 'chickpeas',
  garbanzos: 'chickpeas',
  rutabaga: 'swede',
  'ground pork': 'pork mince',
  'ground turkey': 'turkey mince',
  'ground chicken': 'chicken mince',
  'ground lamb': 'lamb mince',
  'confectioners sugar': 'icing sugar',
  'powdered sugar': 'icing sugar',
  'superfine sugar': 'caster sugar',
  'granulated sugar': 'white sugar',
  'self rising flour': 'self-raising flour',
  'romaine lettuce': 'cos lettuce',
  romaine: 'cos lettuce',
  beet: 'beetroot',
  beets: 'beetroot',
  'red pepper flakes': 'chilli flakes',
  'crushed red pepper': 'chilli flakes',
  'chili flakes': 'chilli flakes',
  'chicken broth': 'chicken stock',
  'beef broth': 'beef stock',
  'vegetable broth': 'vegetable stock',
  broth: 'stock',
  'butternut squash': 'butternut pumpkin',
  'english cucumber': 'continental cucumber',
  'plum tomatoes': 'roma tomatoes',
  'plum tomato': 'roma tomatoes',
  'grape tomatoes': 'cherry tomatoes',
  'kosher salt': 'cooking salt',
  'swiss chard': 'silverbeet',
  chard: 'silverbeet',
  'golden raisins': 'sultanas',
  'fava beans': 'broad beans',
  'lima beans': 'butter beans',
  'baking soda': 'bicarbonate of soda',
  'active dry yeast': 'dried yeast',
  'corn syrup': 'glucose syrup',
  'light corn syrup': 'glucose syrup',
  'graham crackers': 'digestive biscuits',
  'old fashioned oats': 'rolled oats',
  oatmeal: 'rolled oats',
  'club soda': 'soda water',
  seltzer: 'soda water',
  ketchup: 'tomato sauce',
  'pork butt': 'pork shoulder',
  'boston butt': 'pork shoulder',
};

/** Dict lookup on the normalized term; unknown terms pass through unchanged. */
export function translateTerm(term: string): string {
  const normalized = term
    .toLowerCase()
    .replace(/[\s-]+/g, ' ')
    .trim();
  return US_TO_AU_TERMS[normalized] ?? term;
}

// Measurement words carry no product identity. Spoonacular's parsed `name` can
// be a slice of the raw recipe text — "4.5 cups of water" arrives as "of
// water", "0.5 cloves 6 garlic" as "6 garlic" — and searching Woolworths for
// that slice finds nothing (#285).
const MEASUREMENT_WORDS = new Set([
  'cup',
  'cups',
  'tsp',
  'teaspoon',
  'teaspoons',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'g',
  'gram',
  'grams',
  'kg',
  'kilogram',
  'kilograms',
  'ml',
  'millilitre',
  'millilitres',
  'milliliter',
  'milliliters',
  'l',
  'litre',
  'litres',
  'liter',
  'liters',
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'pinch',
  'pinches',
  'dash',
  'dashes',
  'handful',
  'handfuls',
]);
const NUMBER = /^[\d.⁄/]+$/; // "6", "4.5", "1/2"
const NUMBER_WITH_UNIT = /^\d+(?:\.\d+)?(?:g|kg|ml|l|oz|lb|lbs)$/; // "400g"

// A unit token may arrive wearing its abbreviation period — "lb.", "oz." —
// when Spoonacular's metric rewrite moves the amount to metric but leaves the
// imperial token in the parsed name ("250/gr" structured, "lb." still in the
// text, #305). The dot never changes what the word is.
const isMeasurementWord = (word: string) => MEASUREMENT_WORDS.has(word.replace(/\.$/, ''));

/**
 * The one search-term derivation (#285): the term the Matcher searches, the
 * term an Unmatched line's search link carries at mint, and the term a
 * demotion falls back to are all this — numbers and measurement words dropped,
 * a leading "of" with them ("of water" → "water", never "cream of tartar" →
 * "cream tartar"), then the US→AU translation. A name that was nothing but
 * measurement passes through untouched rather than searching for "".
 */
export function deriveSearchTerm(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[\s-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(
      (word) => !NUMBER.test(word) && !NUMBER_WITH_UNIT.test(word) && !isMeasurementWord(word)
    );
  while (words[0] === 'of') words.shift();
  return translateTerm(words.join(' ') || name);
}

// Count words that ride a numeral as one quantity phrase — "5 pieces", "2
// slices". Standing alone they can be product identity ("garlic cloves"), so
// they are only ever dropped directly behind a dropped leading number.
const COUNT_WORDS = new Set([
  'piece',
  'pieces',
  'slice',
  'slices',
  'clove',
  'cloves',
  'serving',
  'servings',
]);

const isNumeric = (word: string) => NUMBER.test(word) || NUMBER_WITH_UNIT.test(word);

/**
 * The display-name cleaning (#286), deliberately narrower than
 * `deriveSearchTerm`: a search term may shed every measurement word and
 * lowercase what is left, but the name a Shopper reads must keep its casing
 * and lose nothing that could be product identity. So only the leading
 * quantity phrase Spoonacular embeds ("5 pieces chicken breasts", "6 garlic"
 * — #287 found the noise arrives in the source data) is stripped. Null is
 * "cannot clean" — a number the strip could not place, or the single-letter
 * fragment a unit eaten mid-word leaves behind ("m zarella") — and the caller
 * falls back to the recipe's own wording rather than silently changing what
 * is to be bought.
 */
export function sanitiseIngredientName(name: string): string | null {
  const words = name.trim().split(/\s+/);
  let stripped = false;
  while (words.length > 0) {
    if (isNumeric(words[0])) {
      words.shift();
      const next = words[0]?.toLowerCase();
      if (next !== undefined && (COUNT_WORDS.has(next) || isMeasurementWord(next))) words.shift();
    } else if (/\.$/.test(words[0]) && isMeasurementWord(words[0].toLowerCase())) {
      // A dotted token is unambiguously a unit ("oz. bacon", #305), so it
      // strips even without a number in front — a bare one ("cup") never
      // does, because standing alone it could be product identity.
      words.shift();
    } else {
      break;
    }
    stripped = true;
  }
  // The "of" the stripped phrase governed ("lb. of fettuccini pasta") goes
  // with it; an "of" inside a name it never touched stays where it is.
  while (stripped && words[0]?.toLowerCase() === 'of') words.shift();
  if (words.length === 0) return null;
  // ponytail: two tells, grown from the observed specimens exactly as the
  // vocabulary above grows — a number still inside the name, a stray single
  // letter. Add tells when production shows a noise shape these miss.
  return words.some((word) => isNumeric(word) || /^[a-z]$/i.test(word)) ? null : words.join(' ');
}

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

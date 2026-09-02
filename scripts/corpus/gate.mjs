// The corpus pipeline's first two gate layers (#336), run in order, cheapest
// first: structural, then culinary. They sit between authoring (#335) and the
// tally and human layers (#337), and they are compliance and quality controls
// rather than style checks — read
// docs/adr/0012-owned-recipes-are-authored-from-fact-records.md and
// docs/adr/0011-reference-data-is-a-third-storage-tier.md before changing them.
//
//   - **Structural** is mechanical and offline: the record is the shape
//     `backend/src/services/ownedRecipeStore.ts` loads, the vocabulary is AU,
//     the image is present at 4:3, and the authoring amendments hold. Those
//     amendments — dried spices and packet goods weighed in g/ml, quantities in
//     pack form, fresh herbs in bunch — lived only in the author's brief during
//     the pilot, and a third of parallel authoring runs broke them. Only gates
//     hold, so here they are gates.
//   - **Culinary** is two judges from model families the author is not (the
//     author is Claude, so the judges are OpenAI and Google). Both must pass.
//     The pilot's pair each caught a gluten-free trap the other missed, so a
//     single judge, or two judges of one family, is not this layer — the gate
//     refuses to run rather than report a pass it did not earn.
//   - A failure is a rewrite instruction, never a discard. The pilot measured a
//     28% first-pass culinary failure rate, all cleared within two rewrites,
//     none of 50 dropped. Unlike the overlap checker's flags — where the
//     offending span is source text and must not travel back into the author's
//     context — a structural or culinary failure is written about our own
//     record in our own words, so it goes back verbatim.
//
// The vocabularies are read out of the TypeScript that already owns them
// (`shared/types/cook.ts`, `backend/src/services/usToAuTerms.ts`) rather than
// copied, so a chip added there widens the gate on its own.
//
// Pure Node, no build step. The judges are injectable, which is what lets
// gate.test.mjs assert all of the above offline.
//
//   node scripts/corpus/gate.mjs check <recordsDir> [--structural] [--images .corpus-images] [slug...]
//   node scripts/corpus/gate.mjs dish  "<dish>" [--out records]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authorDish, commitRecord } from './author-dish.mjs';
import { imageUrl } from './images.mjs';
import { readDish } from './read-dish.mjs';

// ------------------------------------------------------- the vocabularies, borrowed

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** One `const NAME = ['a', 'b']` list of strings, read off the TypeScript. */
function tsStringList(text, name) {
  const array = new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(text);
  if (!array) throw new Error(`${name} is no longer a string array in the TypeScript`);
  return [...array[1].matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

const COOK_TYPES = source('../../shared/types/cook.ts');
export const MEAL_TYPES = tsStringList(COOK_TYPES, 'MEAL_TYPES');
export const CUISINES = tsStringList(COOK_TYPES, 'CUISINES');
export const DIETS = tsStringList(COOK_TYPES, 'DIETS');

/**
 * The US→AU table the Product Match already owns (#243), read as the lint's
 * word list: an Owned Recipe is authored in AU vocabulary, so the US side of
 * that table must never appear in one. Keys are written both quoted and bare
 * in the TypeScript, and a lint that reads only the quoted half would miss
 * `cilantro`, `cornstarch` and `ketchup`.
 */
export const US_TO_AU = new Map(
  [
    ...source('../../backend/src/services/usToAuTerms.ts').matchAll(
      /^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'([^']+)'/gm
    ),
  ].map((match) => [match[1] ?? match[2], match[3]])
);

// ------------------------------------------------------- the record's own shape

/**
 * The shipping record, field for field. This is the second spelling of
 * `ownedRecipeStore.ts`'s zod schema — the gate is what a corpus run is judged
 * by and the store is what boots, and the two must agree. `steps`/`ingredients`
 * are this repo's own vocabulary (ADR 0006), never Spoonacular's wire shape.
 * ponytail: two spellings, kept in step by the seed corpus passing this gate.
 * Collapse them only if one can be generated from the other without a build.
 */
const REQUIRED_FIELDS = [
  'kind',
  'placeId',
  'name',
  'servings',
  'mealType',
  'diets',
  'ingredients',
  'steps',
];
const OPTIONAL_FIELDS = ['photoUrl', 'cuisine'];
const INGREDIENT_FIELDS = ['name', 'searchTerm', 'amount', 'unit', 'original'];

/** ADR 0012: an Owned Recipe names no source, so these are refused by name. */
const CREDIT_FIELDS = ['sourceName', 'sourceUrl', 'creditUrl', 'provenance'];

/** The units the authoring brief allows. `''` pairs with a countable name. */
export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'bunch', ''];

// The amendments the pilot had to turn into gates. Both lists grow from gate
// failures — a term arrives attached to the Recipe that got it wrong — never
// from speculative vocabulary sweeps.
const SPICE_MARKERS = /(?<![a-z])(dried|ground|powder|powdered|flakes|seeds|granules)(?![a-z])/;
const PACKET_GOODS = [
  'paprika',
  'cumin',
  'turmeric',
  'cinnamon',
  'nutmeg',
  'cardamom',
  'allspice',
  'cayenne',
  'garam masala',
  'five spice',
  'star anise',
  'saffron',
  'sumac',
  'cornflour',
  'plain flour',
  'self-raising flour',
  'baking powder',
  'bicarbonate of soda',
  'caster sugar',
  'icing sugar',
  'white sugar',
  'brown sugar',
  'gelatine',
  'cocoa',
  'desiccated coconut',
  'breadcrumbs',
];
/**
 * The Staples, read off `backend/src/services/staples.ts` — the same set the
 * Shopping List mutes and every Tally excludes. A listed Staple is exempt from
 * the "named in a step" rule below, because the method is free to reach for it
 * as "the oil" or "a pinch".
 * ponytail: the tail rule without staples.ts's `NOT_STAPLE` exceptions, which
 * only ever make the exemption slightly wider. Port them if a real Recipe is
 * ever let off by one.
 */
const STAPLES = tsStringList(source('../../backend/src/services/staples.ts'), 'STAPLES');

const isStaple = (name) => STAPLES.some((staple) => name === staple || name.endsWith(` ${staple}`));

const FRESH_HERBS = [
  'basil',
  'chives',
  'coriander',
  'dill',
  'marjoram',
  'mint',
  'oregano',
  'parsley',
  'rosemary',
  'sage',
  'tarragon',
  'thyme',
];

/** A pack-form gram or millilitre amount: whole, and round at the sizes shops sell. */
const PACK_STEP = 5;
const PACK_STEP_FROM = 100;

const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * On word boundaries: "beet" is not in "beetroot", "sage" is not in "sausage".
 *
 * A term is written the way `translateTerm` normalises one — lowercase, hyphens
 * and whitespace collapsed — but the text it is matched against is not, so the
 * pattern spells the separator back out and forgives a trailing plural. Without
 * that, half the table only bites in the exact spelling it happens to be
 * written in: "bell peppers" and "self-rising flour" would walk past the lint
 * while "bell pepper" is caught.
 */
const wordRe = (term) =>
  new RegExp(`(?<![a-z0-9])${escape(term).replace(/[\s-]+/g, '[\\s-]+')}(?:e?s)?(?![a-z0-9])`);

const holds = (text, term) => wordRe(term).test(text);

const list = (values) => values.map((value) => `"${value}"`).join(', ');

// ------------------------------------------------------- the structural layer

/**
 * Everything wrong with one Recipe's record, as sentences an author can act on
 * without anybody opening the Recipe. `context` carries what only the corpus
 * knows: the directory the record lives in, and the names already taken.
 *
 * The image is checked separately by `imageFailures`, because the two run at
 * different moments — this half runs inside the authoring loop, where no photo
 * has been generated yet, and both run over a finished corpus.
 */
export function shapeFailures(recipe, { slug, seen = new Map() } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (recipe.kind !== 'recipe') fail(`kind is ${JSON.stringify(recipe.kind)}, not "recipe"`);
  if (!/^owned:[a-z0-9-]+$/.test(String(recipe.placeId ?? ''))) {
    fail(`placeId is ${JSON.stringify(recipe.placeId)}, not "owned:<frozen-slug>"`);
  } else if (slug !== undefined && recipe.placeId !== `owned:${slug}`) {
    fail(`placeId is ${JSON.stringify(recipe.placeId)}, not "owned:${slug}" (its directory)`);
  }

  for (const field of Object.keys(recipe)) {
    if (REQUIRED_FIELDS.includes(field) || OPTIONAL_FIELDS.includes(field)) continue;
    if (CREDIT_FIELDS.includes(field)) {
      fail(`"${field}" is a source credit — an Owned Recipe never carries one (ADR 0012)`);
    } else {
      fail(
        `unexpected field "${field}" — a record holds only ` +
          `${list([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])}`
      );
    }
  }

  // Every other required field reports its own absence below, as the value it
  // is not — one sentence per defect rather than "missing" and then "not one of".
  if (typeof recipe.name !== 'string' || !recipe.name.trim()) fail('"name" is empty');
  else {
    const taken = seen.get(recipe.name.toLowerCase().trim());
    if (taken && taken !== slug) fail(`name "${recipe.name}" is already ${taken}'s`);
  }

  if (!Number.isInteger(recipe.servings) || recipe.servings < 1) {
    fail(`servings is ${JSON.stringify(recipe.servings)}, not a whole number of people`);
  }
  if (!MEAL_TYPES.includes(recipe.mealType)) {
    fail(`mealType is ${JSON.stringify(recipe.mealType)}, not one of ${list(MEAL_TYPES)}`);
  }
  if (recipe.cuisine !== undefined && !CUISINES.includes(recipe.cuisine)) {
    fail(`cuisine is ${JSON.stringify(recipe.cuisine)}, not one of ${list(CUISINES)}`);
  }

  const diets = Array.isArray(recipe.diets) ? recipe.diets : [];
  if (!Array.isArray(recipe.diets)) fail('"diets" is not an array (declare [] when none hold)');
  // Only the vocabulary. `vegan ⊆ vegetarian ⊆ pescetarian` is the store's
  // ladder (`ownedRecipeStore.ts`): a record declares the strictest diet it
  // holds and answers every looser chip, so demanding the looser ones here
  // would be the gate contradicting the code that reads the record.
  for (const diet of diets) {
    if (!DIETS.includes(diet)) fail(`diet ${JSON.stringify(diet)} is not one of ${list(DIETS)}`);
  }

  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  if (!steps.length) fail('"steps" is empty');
  const stepText = steps.join(' ').toLowerCase();

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!ingredients.length) fail('"ingredients" is empty');
  for (const ingredient of ingredients) failures.push(...ingredientFailures(ingredient, stepText));

  failures.push(...auTermFailures(ingredients, steps));
  return failures;
}

function ingredientFailures(ingredient, stepText) {
  const failures = [];
  const name = String(ingredient.name ?? '').toLowerCase();
  const label = JSON.stringify(ingredient.name);
  const { amount, unit } = ingredient;

  for (const field of Object.keys(ingredient)) {
    if (!INGREDIENT_FIELDS.includes(field)) {
      failures.push(`ingredient ${label}: unexpected field "${field}"`);
    }
  }
  if (!name) failures.push('an ingredient has no "name"');
  if (!String(ingredient.original ?? '').trim()) {
    failures.push(`ingredient ${label} has no "original" (the cook's own phrasing)`);
  }
  if (typeof amount !== 'number' || !(amount > 0)) {
    failures.push(`ingredient ${label}: amount is ${JSON.stringify(amount)}, not a number above 0`);
  }
  if (!UNITS.includes(unit)) {
    failures.push(
      `ingredient ${label}: unit is ${JSON.stringify(unit)}, not one of ${list(UNITS)}`
    );
  }

  // The authoring amendments, mechanically. Each names the fix, not the rule.
  const spice = SPICE_MARKERS.test(name) || PACKET_GOODS.some((good) => holds(name, good));
  if (spice && unit !== 'g' && unit !== 'ml') {
    failures.push(
      `ingredient ${label} is a dried spice or packet good: weigh it in g or ml, not ` +
        `${JSON.stringify(unit)} — the cook's phrasing goes in "original" ("1 tsp (2 g) …")`
    );
  }
  if (!spice && FRESH_HERBS.some((herb) => holds(name, herb)) && unit !== 'bunch') {
    failures.push(
      `ingredient ${label} is a fresh herb: state it in bunch (fractions are fine), not ` +
        JSON.stringify(unit)
    );
  }
  if ((unit === 'kg' || unit === 'l') && typeof amount === 'number' && amount < 1) {
    failures.push(`ingredient ${label}: ${amount} ${unit} is under one — state it in g or ml`);
  }
  if (
    (unit === 'g' || unit === 'ml') &&
    typeof amount === 'number' &&
    (!Number.isInteger(amount) || (amount >= PACK_STEP_FROM && amount % PACK_STEP !== 0))
  ) {
    failures.push(
      `ingredient ${label}: ${amount} ${unit} is not a pack-form quantity — whole numbers, ` +
        `and multiples of ${PACK_STEP} from ${PACK_STEP_FROM} up (500 g mince, not 437 g)`
    );
  }

  // Every ingredient earns its place in the method. Match on the name's words
  // so "brown onion" is found in "the onions", forgive the plural, and keep
  // three-letter head words ("oil", "egg") because a method that says "the oil"
  // for the one oil it lists is good writing, not a missing ingredient.
  // ponytail: any word counts, so an ingredient sharing a word with another
  // ("tinned peaches" beside "tinned tomatoes") passes. That catches the real
  // defect — an ingredient the method never mentions at all — with no false
  // positives; the culinary judges read the method properly.
  const tokens = (name.match(/[a-z]{3,}/g) ?? []).map((token) => token.replace(/(es|s)$/, ''));
  if (tokens.length && !isStaple(name) && !tokens.some((token) => stepText.includes(token))) {
    failures.push(`ingredient ${label} is never named in any step`);
  }
  return failures;
}

/**
 * The AU-vocabulary lint. Longest term first, and a matched term is masked out
 * of the text before the shorter ones are tried, so "chicken broth" reports
 * once rather than twice.
 */
function auTermFailures(ingredients, steps) {
  const terms = [...US_TO_AU.keys()].sort((a, b) => b.length - a.length);
  const fields = [
    ...ingredients.flatMap((ingredient) => [
      { where: `ingredient ${JSON.stringify(ingredient.name)}`, text: ingredient.name },
      { where: `ingredient ${JSON.stringify(ingredient.name)}`, text: ingredient.original },
      { where: `ingredient ${JSON.stringify(ingredient.name)}`, text: ingredient.searchTerm },
    ]),
    ...steps.map((step, index) => ({ where: `step ${index + 1}`, text: step })),
  ];

  const failures = [];
  for (const { where, text } of fields) {
    let rest = String(text ?? '').toLowerCase();
    for (const term of terms) {
      if (!holds(rest, term)) continue;
      rest = rest.replace(new RegExp(wordRe(term).source, 'g'), ' ');
      failures.push(`US term "${term}" in ${where} — Australia says "${US_TO_AU.get(term)}"`);
    }
  }
  return failures;
}

// ------------------------------------------------------- the image

/**
 * A WebP's pixel dimensions, off the container header — the three chunk kinds
 * a `cwebp` run can emit. Throws on anything that is not one of them, which is
 * what a truncated or half-written image looks like from here.
 */
export function webpSize(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('not a RIFF/WEBP container');
  }
  const chunk = bytes.toString('ascii', 12, 16);
  // Lossy: a 3-byte frame tag and the 3-byte start code, then 14-bit dimensions.
  if (chunk === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  // Lossless: 14 bits each, minus one, packed behind the 0x2f signature byte.
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  // Extended (an image carrying metadata): the canvas size, minus one, 24-bit.
  if (chunk === 'VP8X') {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unknown WebP chunk "${chunk}"`);
}

/**
 * The Recipe's photo: on the corpus bucket's URL, on disk, and 4:3 — the shape
 * every Deck card and Match hero is cropped for (`images.mjs`). Aspect rather
 * than an exact size, so a hand-regenerated image at another 4:3 size still
 * passes.
 */
export function imageFailures(recipe, path) {
  const failures = [];
  const expected = imageUrl(String(recipe.placeId ?? '').replace(/^owned:/, ''));
  if (!recipe.photoUrl) {
    failures.push(`"photoUrl" is missing — run \`images.mjs collect\` to stamp ${expected}`);
  } else if (recipe.photoUrl !== expected) {
    failures.push(`photoUrl is ${JSON.stringify(recipe.photoUrl)}, not "${expected}"`);
  }

  if (!existsSync(path)) {
    failures.push(`no image at ${path} — run \`images.mjs collect\``);
    return failures;
  }
  try {
    const { width, height } = webpSize(readFileSync(path));
    if (width * 3 !== height * 4) {
      failures.push(`${path} is ${width}x${height}, which is not 4:3`);
    }
  } catch (error) {
    failures.push(`${path} is not a readable WebP: ${error.message}`);
  }
  return failures;
}

// ------------------------------------------------------- the culinary layer

/** The family that writes the Recipes, and so may not sit in judgement on one. */
export const AUTHOR_FAMILY = 'anthropic';

// The judge models, one per family. Bump them here; the ids move faster than
// this file does, and a stale one fails loudly on the first call of a run
// rather than quietly grading badly.
const OPENAI_MODEL = 'gpt-5.5';
const GEMINI_MODEL = 'gemini-pro-latest';

export const JUDGE_RUBRIC = `You are an independent culinary reviewer for an Australian home-cooking
recipe corpus. Judge ONLY the recipe below, on these axes:

1. quantities are sane for the stated servings;
2. times and temperatures are realistic;
3. the method is causally ordered and complete — nothing used before it is prepared, nothing
   listed and then never used;
4. seasoning is present and sane;
5. the dish is the dish its name claims — a shopper who cooks this gets what they expected;
6. every declared diet genuinely holds against every ingredient, including hidden traps (soy
   sauce and stock are not gluten free unless the ingredient says so).

Salt, pepper, water and olive oil are pantry staples the method may use without listing them —
never fail a recipe for those. Judge the cooking, not the wording: house style, ingredient
naming and Australian spelling are somebody else's gate.

Answer with strict JSON and nothing else: {"pass": true|false, "reasons": ["..."]}. Every reason
names one concrete defect and what would fix it; the list is empty when you pass the recipe.`;

/** A verdict out of whatever the judge answered with, or a throw. JSON, no prose. */
function parseVerdict(family, text) {
  const json = /\{[\s\S]*\}/.exec(String(text));
  if (!json) throw new Error(`CULINARY_UNREADABLE: the ${family} judge answered with no JSON`);
  const verdict = JSON.parse(json[0]);
  if (typeof verdict.pass !== 'boolean') {
    throw new Error(`CULINARY_UNREADABLE: the ${family} judge answered without a pass`);
  }
  return verdict;
}

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — AGENTS.md says where the credential lives`);
  return value;
};

async function post(url, init) {
  const response = await fetch(url, {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(`${url} → ${response.status} ${await response.text()}`);
  return response.json();
}

/** The Recipe as a judge sees it: the cooking, without our identity fields. */
const forJudging = ({ kind, placeId, photoUrl, ...recipe }) => JSON.stringify(recipe, null, 2);

async function openAiJudge(recipe) {
  const body = await post('https://api.openai.com/v1/chat/completions', {
    headers: { authorization: `Bearer ${env('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUDGE_RUBRIC },
        { role: 'user', content: forJudging(recipe) },
      ],
    }),
  });
  return parseVerdict('openai', body.choices?.[0]?.message?.content);
}

async function geminiJudge(recipe) {
  const body = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      headers: { 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: JUDGE_RUBRIC }] },
        contents: [{ role: 'user', parts: [{ text: forJudging(recipe) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  return parseVerdict(
    'google',
    body.candidates?.[0]?.content?.parts?.map((part) => part.text).join('')
  );
}

/**
 * Two judges, two families, neither the author's — the pilot's GPT and Claude
 * pair each caught a gluten-free trap the other missed, so a second genuine
 * family is the layer rather than a nicety, and Claude is already the author.
 */
export const DEFAULT_JUDGES = [
  { family: 'openai', judge: openAiJudge },
  { family: 'google', judge: geminiJudge },
];

/**
 * What the judges say is wrong. Empty means both passed; anything else sends
 * the Recipe back, whichever judge said it.
 *
 * A judge that cannot answer throws rather than abstaining: a layer that
 * silently ran once is not this layer, and the whole point of provisioning a
 * second family up front was not to discover its absence mid-run.
 */
export async function culinaryFailures(recipe, judges = DEFAULT_JUDGES) {
  const families = new Set(judges.map((judge) => judge.family));
  if (families.size < 2) {
    throw new Error(
      `CULINARY_JUDGES_INVALID: two model families are the layer, got ${list([...families])}`
    );
  }
  if (families.has(AUTHOR_FAMILY)) {
    throw new Error(`CULINARY_JUDGES_INVALID: "${AUTHOR_FAMILY}" is the author's own family`);
  }
  const verdicts = await Promise.all(judges.map(({ judge }) => judge(recipe)));
  return verdicts.flatMap((verdict, index) =>
    verdict.pass
      ? []
      : (verdict.reasons?.length ? verdict.reasons : ['rejected with no reason given']).map(
          (reason) => `${judges[index].family} judge: ${reason}`
        )
  );
}

// ------------------------------------------------------- the layers, in order
/** The pilot's budget: two rewrites cleared every culinary failure it found. */
export const MAX_REGATES = 2;

const REWRITE_INTRO =
  'A previous attempt failed the corpus gate. Fix every point below in a fresh draft — they ' +
  'describe your own recipe, not anybody else’s:';

/**
 * Author one dish and hold it against both layers, structural first because it
 * is free. A failure is a rewrite instruction and another pass, never a drop:
 * the pilot's 28% first-pass culinary failures all cleared inside two rewrites
 * and none of its 50 dishes was discarded.
 *
 * The loop lives here, in the same process as the read, because a re-author
 * runs `authorDish` again and the overlap checker it calls needs the captures —
 * which exist only in memory, and only for this run (ADR 0012).
 *
 * The image is not checked here: it does not exist yet. `imageFailures` runs
 * over the finished corpus, from `check`.
 */
export async function gateDish(record, captures, options = {}) {
  const { judges = DEFAULT_JUDGES, maxRegates = MAX_REGATES, seen, ...authoring } = options;
  let notes = [];
  for (let attempt = 0; ; attempt++) {
    const recipe = await authorDish(record, captures, { ...authoring, notes });
    // Structural first because it is free, and the judges are spared a record
    // whose defects the mechanical layer has already named.
    const failures = shapeFailures(recipe, { slug: record.slug, seen });
    if (!failures.length) failures.push(...(await culinaryFailures(recipe, judges)));
    if (!failures.length) return recipe;
    if (attempt >= maxRegates) {
      throw new Error(
        `GATE_UNRESOLVED: ${record.dish} after ${maxRegates} rewrites — ${failures.join('; ')}`
      );
    }
    // Verbatim, unlike an overlap flag: every word of this was written about
    // our own record, by us, so none of it is source text.
    notes = [REWRITE_INTRO, ...failures];
  }
}

// ------------------------------------------------------- the CLI

/** The flags that eat the argument behind them. Every other `--flag` is a
 *  boolean, so what follows it is positional. Keyed rather than inferred from
 *  position: `--structural black-bean-tacos` is a slug, and reading it as a
 *  flag value silently widens a one-record run into the whole corpus. */
const VALUE_FLAGS = new Set(['--images', '--out']);

/** The arguments that are not a flag and not a flag's value. */
export const positionalArgs = (rest) =>
  rest.filter((argument, index) => !argument.startsWith('--') && !VALUE_FLAGS.has(rest[index - 1]));

/** Every `<recordsDir>/<slug>/recipe.json`, or just the named slugs. */
function selectSlugs(recordsDir, slugs) {
  const present = readdirSync(recordsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(recordsDir, entry.name, 'recipe.json'))
    )
    .map((entry) => entry.name);
  if (!slugs.length) return present.sort();
  // A typo must never quietly shrink a gate run into a pass.
  for (const slug of slugs) {
    if (!present.includes(slug)) throw new Error(`no ${join(recordsDir, slug, 'recipe.json')}`);
  }
  return slugs;
}

/**
 * Both layers over a corpus that already exists — what #338 re-gates the pilot
 * with, and what a reviewer runs before a corpus pull request. `--structural`
 * stops before the judges: the mechanical layer is free and instant, and it is
 * the one you run in a loop while fixing records.
 */
async function check(recordsDir, imagesDir, slugs, judged) {
  const seen = new Map();
  let failed = 0;
  const all = selectSlugs(recordsDir, slugs);
  for (const slug of all) {
    const recipe = JSON.parse(readFileSync(join(recordsDir, slug, 'recipe.json'), 'utf8'));
    const failures = [
      ...shapeFailures(recipe, { slug, seen }),
      ...imageFailures(recipe, join(imagesDir, `${slug}.webp`)),
    ];
    if (judged && !failures.length) failures.push(...(await culinaryFailures(recipe)));
    seen.set(
      String(recipe.name ?? '')
        .toLowerCase()
        .trim(),
      slug
    );
    failed += failures.length ? 1 : 0;
    console.log(failures.length ? `${slug}: FAIL\n  ${failures.join('\n  ')}` : `${slug}: pass`);
  }
  console.log(
    `\n${all.length - failed}/${all.length} pass ${judged ? 'both layers' : 'structural'}`
  );
  if (failed) process.exitCode = 1;
}

/** One dish, all the way through: read, author, gate, re-author, commit. */
async function dish(name, out) {
  const { record, captures } = await readDish(name);
  const recipe = await gateDish(record, captures);
  console.error(
    `${commitRecord(out, record, recipe)}: ${recipe.name}, ${recipe.servings} servings`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = rest.indexOf(name);
    return at === -1 ? fallback : rest[at + 1];
  };
  const positional = positionalArgs(rest);

  const run = {
    check: () =>
      check(
        positional[0],
        flag('--images', '.corpus-images'),
        positional.slice(1),
        !rest.includes('--structural')
      ),
    dish: () => dish(positional[0], flag('--out', 'records')),
  }[command];
  if (!run || !positional[0]) {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(2);
  }
  await run();
}

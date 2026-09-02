// The corpus pipeline's authoring stage (#335): one Fact Record in, one Owned
// Recipe out, with every source closed. This is the half of the re-authoring
// standard that never touches the outside world, and the wall between it and
// the reading stage is what makes ADR 0012 architectural rather than
// aspirational — read
// docs/adr/0012-owned-recipes-are-authored-from-fact-records.md before changing
// any of it:
//
//   - `authorRecipe` takes the Fact Record and the checker's flag kinds. Raw
//     source text is not a parameter of it and is not in its lexical scope, so
//     the separation is a property of the call graph rather than a sentence in
//     a prompt that a model may or may not honour.
//   - the overlap checker runs in-run, against the sources the reading stage
//     just captured in memory, before they are discarded: shared 5-gram
//     shingles at a threshold of 8, 12-word verbatim runs, and the authored
//     quantity set against each source's observed one.
//   - a flag is a re-author, never a warning. `authorDish` returns a clean
//     Recipe or throws; there is no third outcome.
//   - the ~20 convergent kitchen idioms ("preheat the oven…", "season to taste
//     with salt and pepper") are banned in the prompt rather than excluded from
//     the checker. The pilot priced that boilerplate at a ~8% false-flag rate;
//     banning it costs a rewrite cycle or two, and tuning the threshold down to
//     accommodate it would cost the check its teeth.
//   - the Fact Record commits next to the Recipe it produced. The captures
//     commit nowhere: nothing here writes them, so they die with the process.
//
// Pure Node, no build step. `author` is injectable, which is what lets
// author-dish.test.mjs assert all of the above offline.
//
//   node scripts/corpus/author-dish.mjs "<dish>" [--out records]

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readDish } from './read-dish.mjs';

/** Shingle width, and the count of shared shingles that flags one source. */
export const SHINGLE_SIZE = 5;
export const SHINGLE_THRESHOLD = 8;

/** A contiguous run this long, shared with a source, is a verbatim lift. */
export const VERBATIM_RUN_WORDS = 12;

/** Below this many shared ingredients a "matching" quantity set means nothing. */
export const MIN_QUANTITY_SET = 3;

/** The pilot's budget: two rewrites, then the dish is dropped rather than shipped. */
export const MAX_REWRITES = 2;

// The stock idioms every recipe writer converges on independently. They are
// banned at the source — in the prompt — because a checker that excused them
// would excuse them everywhere, including inside a genuine lift.
export const BANNED_IDIOMS = [
  'preheat the oven to',
  'line a baking tray with baking paper',
  'grease and line a',
  'heat the oil in a large frying pan over medium heat',
  'cook, stirring occasionally, until softened',
  'season to taste with salt and pepper',
  'bring to the boil, then reduce the heat and simmer',
  'cook according to packet directions',
  'set aside to cool slightly',
  'add the garlic and cook for a further minute until fragrant',
  'stir to combine',
  'transfer to a plate and cover to keep warm',
  'cook until golden brown on both sides',
  'drain and return to the pan',
  'serve immediately, garnished with',
  'in a large bowl, combine',
  'cover and refrigerate for at least 30 minutes',
  'remove from the heat and stir through',
  'or until the onion has softened',
  'reserve 1 cup of the cooking water',
];

export const AUTHORING_RULES = `You are the authoring stage of a recipe corpus pipeline. You write recipes for
Dinder, an Australian app. You have never seen a published recipe for this dish and never will:
your whole input is a Fact Record of observations gathered from several publishers. Write the
dish, not a version of anybody's page.

- Method: plain Australian English, metric, direct imperative steps in Dinder's own voice. The
  sentence architecture is yours — you have no source's to borrow.
- Amounts are your own: sane AU-metric numbers informed by the observed ranges, never one
  source's set. Round to what a Woolworths shopper buys (500 g mince, not 437 g), and state
  quantities in the form the product is sold ("1 kg potatoes", not "800 g potatoes").
- AU vocabulary: capsicum, coriander, beef mince, thickened cream, plain flour, spring onions,
  chicken stock, cornflour, icing sugar, caster sugar, bicarbonate of soda.
- Units: g, kg, ml, l, tsp, tbsp, cup, bunch (fresh herbs, fractions fine), or "" with a
  countable name ("2 eggs"). Small quantities of packet goods and dried spices take g or ml;
  the cook-friendly phrasing lives in "original" ("1 tbsp (10 g) cornflour"). No handfuls, no
  "to taste" in an amount — a pinch of salt belongs in the step text.
- "name" is what you would type into Woolworths search. When it has to be diet-qualified to stay
  honest ("gluten free cornflour"), add a plain matchable "searchTerm" beside it.
- Name each ingredient with the Fact Record's canonicalIngredients wording — it is already a plain
  AU search term. Where yours must differ, keep the record's words somewhere in "original".
- Every ingredient appears in some step; every step names only listed ingredients. Salt, pepper,
  water and olive oil are staples and may appear freely.
- "name" is the plain dish name. "servings" is mandatory, "readyInMinutes" honest. One meal type,
  at most one cuisine, diets declared only when the recipe genuinely holds them.

Banned phrasings. These are the idioms every recipe site converges on, and an overlap checker
cannot tell convergence from copying. Never write them, in any tense or inflection — write the
same instruction in your own words instead:
${BANNED_IDIOMS.map((idiom) => `- ${idiom}`).join('\n')}`;

// ---------------------------------------------------------------- the checker

const words = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);

/** The distinct `n`-word shingles of one span of text. */
export function shingles(text, n) {
  const list = words(text);
  const out = new Set();
  for (let i = 0; i + n <= list.length; i++) out.add(list.slice(i, i + n).join(' '));
  return out;
}

/** How many of `a`'s shingles `b` also holds. */
function sharedCount(a, b) {
  let count = 0;
  for (const shingle of a) if (b.has(shingle)) count++;
  return count;
}

/**
 * The Recipe's own prose, one segment per field. Shingled per segment, never
 * as one blob: a shingle spanning the join between two steps matches nothing
 * real, and counting it would flag phrasing nobody wrote.
 */
const prose = (recipe) => [
  recipe.name ?? '',
  ...(recipe.extendedIngredients ?? []).map((i) => i.original ?? ''),
  ...(recipe.steps ?? []),
];

const shingleSet = (segments, n) => {
  const out = new Set();
  for (const segment of segments) for (const shingle of shingles(segment, n)) out.add(shingle);
  return out;
};

const normaliseName = (name) => String(name).toLowerCase().trim().replace(/\s+/g, ' ');

// ponytail: string comparison, no unit conversion. "Verbatim" is the standard
// ADR 0012 sets — 0.5 kg where a source wrote 500 g is a different quantity as
// written, and that is exactly the independence the check is asking for.
//
// A fragment stating no number ("salt, to taste") is not a quantity, and comes
// back null. It has to leave the comparison entirely: the authored side is
// always numeric, so one such observation would disagree with everything and
// clear the whole source on its own.
const normaliseQuantity = (fragment) => {
  const match = /^\s*([\d./]+)\s*([a-z]*)/i.exec(String(fragment));
  return match ? `${match[1]} ${match[2].toLowerCase()}`.trim() : null;
};

const recordNames = (record) =>
  (record.canonicalIngredients ?? []).map((i) => normaliseName(i.name)).filter(Boolean);

/**
 * The authored quantity for each ingredient, keyed by the authored name *and*
 * by any Fact Record name the shopper phrasing still carries. `name` is written
 * for Woolworths search and Product Match reads it, so the record's word for
 * the same ingredient often survives only in `original` ("diced tomatoes" /
 * "400 g tinned tomatoes, diced"). Keying on one alone drops the ingredient out
 * of the join and quietly weakens the check.
 */
export const quantitySet = (recipe, record = {}) => {
  const names = recordNames(record);
  const out = new Map();
  for (const ingredient of recipe.extendedIngredients ?? []) {
    const quantity = normaliseQuantity(`${ingredient.amount ?? ''} ${ingredient.unit ?? ''}`);
    const original = normaliseName(ingredient.original ?? '');
    for (const key of [normaliseName(ingredient.name), ...names.filter((n) => original.includes(n))])
      out.set(key, quantity);
  }
  return out;
};

/**
 * One quantity set per source, read off the Fact Record's observations — which
 * the reading stage already tagged with their source index ("500 g (s0)"). The
 * record is the right place to read them from: it is structured, it persists as
 * the audit trail, and it means this check still means something when the
 * captures are gone.
 */
export function sourceQuantitySets(record) {
  const sets = new Map();
  for (const ingredient of record.canonicalIngredients ?? []) {
    for (const observation of ingredient.observations ?? []) {
      const match = /^(.*)\(s(\d+)\)\s*$/.exec(observation);
      if (!match) continue;
      const index = Number(match[2]);
      if (!sets.has(index)) sets.set(index, new Map());
      sets.get(index).set(normaliseName(ingredient.name), normaliseQuantity(match[1]));
    }
  }
  return sets;
}

/**
 * Every way this Recipe reproduces a source. Empty means clean.
 *
 * A flag names the defect and the publisher, never the offending span: the
 * flags travel back to the author, and a shared run of words is source text
 * whatever else it also is. See `REWRITE_NOTES`.
 */
export function checkOverlap(recipe, record, captures) {
  const flags = [];
  const authored = shingleSet(prose(recipe), SHINGLE_SIZE);
  const authoredRuns = shingleSet(prose(recipe), VERBATIM_RUN_WORDS);

  for (const capture of captures) {
    const shared = sharedCount(authored, shingles(capture.text, SHINGLE_SIZE));
    if (shared >= SHINGLE_THRESHOLD) {
      flags.push({ kind: 'shingle', publisher: capture.publisher, shared });
    }
    if (sharedCount(authoredRuns, shingles(capture.text, VERBATIM_RUN_WORDS)) > 0) {
      flags.push({ kind: 'verbatim', publisher: capture.publisher, words: VERBATIM_RUN_WORDS });
    }
  }

  const authoredQuantities = quantitySet(recipe, record);
  // A join that lands on nothing is not a pass, it is the check not running.
  // ADR 0012 counts the quantity-set fingerprint as a compliance control, so
  // names that drift off the record come back as a re-author, not as silence.
  const names = recordNames(record);
  const joined = names.filter((name) => authoredQuantities.has(name));
  if (names.length >= MIN_QUANTITY_SET && joined.length < MIN_QUANTITY_SET) {
    flags.push({ kind: 'quantities-uncheckable', joined: joined.length, of: names.length });
  }

  for (const [index, source] of sourceQuantitySets(record)) {
    // Unparseable on either side is not evidence either way — dropped, never a
    // vote against a match. `!= null` covers the absent key too.
    const shared = [...source].filter(
      ([name, quantity]) => quantity !== null && authoredQuantities.get(name) != null
    );
    if (shared.length < MIN_QUANTITY_SET) continue;
    if (shared.every(([name, quantity]) => authoredQuantities.get(name) === quantity)) {
      const publisher = record.sources?.[index]?.publisher;
      flags.push({ kind: 'quantities', publisher, matched: shared.length });
    }
  }

  return flags;
}

// ---------------------------------------------------------------- the stage

// What a rewrite is told. Not the flagged span, and not the previous draft
// either: a run of words that overlaps a source is source text, so echoing it
// back into the author's context is the one thing the stage boundary exists to
// prevent. A rewrite is a fresh authoring pass with the bar raised, which is
// what the pilot ran and cleared within two attempts.
const REWRITE_NOTES = {
  shingle:
    'A previous attempt shared too much phrasing with a published recipe. Compose every step ' +
    'afresh with a different sentence architecture: different verbs, different clause order, ' +
    'different lengths.',
  verbatim:
    'A previous attempt reproduced a run of words from a published recipe. No sentence of yours ' +
    'may match a published one; write the method again from the facts alone.',
  quantities:
    'A previous attempt reproduced one publisher’s quantities as a set. Choose your own ' +
    'AU-metric, pack-form amounts across the whole ingredient list.',
  'quantities-uncheckable':
    'A previous attempt named its ingredients so far off the Fact Record that the quantity ' +
    'check could not run. Use the record’s canonicalIngredients wording for each ingredient, ' +
    'or keep it in "original".',
};

const MODEL = 'claude-opus-5';

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    servings: { type: 'integer' },
    readyInMinutes: { type: 'integer' },
    mealType: { type: 'string' },
    cuisine: { type: 'string' },
    diets: { type: 'array', items: { type: 'string' } },
    extendedIngredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          searchTerm: { type: 'string' },
          amount: { type: 'number' },
          unit: { type: 'string' },
          original: { type: 'string' },
        },
        required: ['name', 'amount', 'unit', 'original'],
        additionalProperties: false,
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'name',
    'servings',
    'readyInMinutes',
    'mealType',
    'cuisine',
    'diets',
    'extendedIngredients',
    'steps',
  ],
  additionalProperties: false,
};

/**
 * The authoring stage itself. Its entire input is the Fact Record and, on a
 * rewrite, the checker's notes — raw source text is not a parameter and is not
 * in scope here, which is the stage boundary ADR 0012 asks for, drawn in the
 * signature rather than in the prompt.
 */
async function authorRecipe(record, notes = [], client = new Anthropic()) {
  // The URLs go too. They are not source text, but they name the publisher, and
  // a model that knows whose page it is can reach for the house style it
  // remembers. The facts are the whole brief.
  const { sources, skipped, ...facts } = record;
  // Streamed, so the budget is the streaming one: thinking shares the output
  // tokens, and 16000 is the ceiling for a *non*-streaming call. A truncation
  // here throws AUTHORING_INCOMPLETE past the rewrite loop and the dish dies
  // with its tokens spent.
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      system: AUTHORING_RULES,
      output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            `Fact Record:\n${JSON.stringify(facts, null, 2)}` +
            (notes.length ? `\n\nThis is a rewrite.\n${notes.join('\n')}` : ''),
        },
      ],
    })
    .finalMessage();

  // A truncation or a refusal arrives as a 200 with a half-written body, same
  // as the reading stage's extraction: parsing it blind blames JSON.
  if (response.stop_reason !== 'end_turn') {
    throw new Error(`AUTHORING_INCOMPLETE: ${record.dish} stopped on ${response.stop_reason}`);
  }
  return JSON.parse(
    response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  );
}

/**
 * Author one dish and clear it against the sources that were just read.
 *
 * Returns a Recipe the checker passed, or throws. A flagged Recipe is never
 * returned with a warning attached — ADR 0012's "a flag is a re-author" only
 * means anything if there is no other way out of this function.
 */
export async function authorDish(record, captures, options = {}) {
  const { author = authorRecipe, maxRewrites = MAX_REWRITES } = options;
  let notes = [];
  for (let attempt = 0; ; attempt++) {
    const recipe = {
      ...(await author(record, notes)),
      // Frozen from the Fact Record's slug, never from the authored title, so a
      // retitled dish keeps the placeId its image was published under (#330).
      placeId: `owned:${record.slug}`,
    };
    const flags = checkOverlap(recipe, record, captures);
    if (!flags.length) return recipe;
    if (attempt >= maxRewrites) {
      const kinds = [...new Set(flags.map((flag) => flag.kind))].join(', ');
      throw new Error(
        `OVERLAP_UNRESOLVED: ${record.dish} still flagged (${kinds}) after ${maxRewrites} rewrites`
      );
    }
    notes = [...new Set(flags.map((flag) => REWRITE_NOTES[flag.kind]))];
  }
}

/**
 * The pair commits together: the Recipe and the Fact Record it was authored
 * from, in the directory the image pipeline and the gates already read
 * (`<outDir>/<slug>/recipe.json`). The Fact Record beside it is the audit
 * trail — the demonstration that this Recipe's sources were what they were.
 */
export function commitRecord(outDir, record, recipe) {
  const dir = join(outDir, record.slug);
  mkdirSync(dir, { recursive: true });
  const write = (file, value) =>
    writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  write('fact.json', record);
  write('recipe.json', recipe);
  return dir;
}

// CLI: author-dish.mjs "<dish>" [--out records]
// Reading and authoring are one process on purpose. The captures the overlap
// check needs exist only as `readDish`'s return value, so there is no run in
// which raw source text is on disk waiting to be cleaned up.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dish, ...rest] = process.argv.slice(2);
  if (!dish) {
    console.error('usage: author-dish.mjs "<dish>" [--out records]');
    process.exit(2);
  }
  const flag = rest.indexOf('--out');
  const out = flag === -1 ? 'records' : rest[flag + 1];

  const { record, captures } = await readDish(dish);
  const recipe = await authorDish(record, captures);
  console.error(`${commitRecord(out, record, recipe)}: ${recipe.name}, ${recipe.servings} servings`);
}

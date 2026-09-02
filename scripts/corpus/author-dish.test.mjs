// The authoring stage's runnable self-check (#335). Offline: the author is
// injected, so nothing here touches the network or spends a token. The centre
// of it is the deliberately overlapping draft — text lifted straight out of a
// capture, which the checker must catch — because a checker nobody ever feeds a
// real lift is a checker nobody knows works.
//
// The rules under test are ADR 0012's, not style:
// docs/adr/0012-owned-recipes-are-authored-from-fact-records.md.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  AUTHORING_RULES,
  BANNED_IDIOMS,
  MAX_REWRITES,
  authorDish,
  checkOverlap,
  commitRecord,
  shingles,
  sourceQuantitySets,
} from './author-dish.mjs';

// One publisher's page, as the reading stage would hand it over: plain text, in
// memory, alive only for this check.
const SOURCE_TEXT = [
  'Heat a splash of oil in a heavy pot and brown the beef mince in two batches until deeply coloured.',
  'Add the onion, carrot and celery and cook until soft, then pour in the tomatoes and stock.',
  'Simmer gently for at least forty five minutes, stirring now and then, until the sauce is thick.',
].join('\n');

const CAPTURES = [
  { url: 'https://a.com/dish', publisher: 'a.com', text: SOURCE_TEXT },
  { url: 'https://b.com/dish', publisher: 'b.com', text: 'A quite different page about ragu.' },
  { url: 'https://c.com/dish', publisher: 'c.com', text: 'Another page, differently written.' },
];

const RECORD = {
  slug: 'beef-ragu',
  dish: 'Beef ragu',
  sources: [
    { url: 'https://a.com/dish', publisher: 'a.com', accessed: '2026-09-02', robots_ok: true },
    { url: 'https://b.com/dish', publisher: 'b.com', accessed: '2026-09-02', robots_ok: true },
    { url: 'https://c.com/dish', publisher: 'c.com', accessed: '2026-09-02', robots_ok: true },
  ],
  skipped: [],
  canonicalIngredients: [
    { name: 'beef mince', essential: true, observations: ['500 g (s0)', '1 lb (s1)', '750 g (s2)'] },
    { name: 'brown onion', essential: true, observations: ['1 (s0)', '2 (s1)', '1 (s2)'] },
    {
      name: 'tinned tomatoes',
      essential: true,
      observations: ['400 g (s0)', '800 g (s1)', '400 g (s2)'],
    },
    { name: 'beef stock', essential: false, observations: ['250 ml (s0)', '500 ml (s1)'] },
  ],
  causalSequence: ['brown mince in batches', 'soften aromatics', 'add tomato and stock; simmer'],
  techniqueFacts: ['a long simmer is the flavour lever (3 sources)'],
  servingsObserved: [4, 6, 4],
};

/** Amounts that reproduce nobody's set; steps in a voice no source used. */
const CLEAN = {
  name: 'Beef Ragu',
  servings: 4,
  readyInMinutes: 90,
  mealType: 'main course',
  cuisine: 'italian',
  diets: [],
  extendedIngredients: [
    { name: 'beef mince', amount: 500, unit: 'g', original: '500 g beef mince' },
    { name: 'brown onion', amount: 2, unit: '', original: '2 brown onions, finely chopped' },
    { name: 'tinned tomatoes', amount: 800, unit: 'g', original: '800 g tinned tomatoes' },
    { name: 'beef stock', amount: 300, unit: 'ml', original: '300 ml beef stock' },
  ],
  steps: [
    'Brown the mince hard, in two goes, so it colours rather than steams.',
    'Soften the vegetables, tip in the tin of tomatoes, and let it tick over for an hour.',
  ],
};

/** The same Recipe with one step taken straight off the page. */
const LIFTED = {
  ...CLEAN,
  steps: [
    'Heat a splash of oil in a heavy pot and brown the beef mince in two batches until deeply coloured.',
    CLEAN.steps[1],
  ],
};

const kinds = (flags) => flags.map((flag) => flag.kind).sort();

test('shingles: distinct n-word windows, punctuation and case ignored', () => {
  assert.deepEqual([...shingles('Brown the mince, in batches.', 5)], [
    'brown the mince in batches',
  ]);
  assert.equal(shingles('one two three', 5).size, 0);
});

test('a step lifted from a source is caught as both a shingle and a verbatim run', () => {
  const flags = checkOverlap(LIFTED, RECORD, CAPTURES);
  assert.deepEqual(kinds(flags), ['shingle', 'verbatim']);
  assert.ok(flags.every((flag) => flag.publisher === 'a.com'));
  assert.ok(flags.find((flag) => flag.kind === 'shingle').shared >= 8);
});

test('an independently written Recipe over the same facts passes clean', () => {
  assert.deepEqual(checkOverlap(CLEAN, RECORD, CAPTURES), []);
});

test('reproducing one source’s quantity set is caught even with original wording', () => {
  // s2's observations exactly: 750 g mince, 1 onion, 400 g tomatoes.
  const copied = {
    ...CLEAN,
    extendedIngredients: [
      { name: 'beef mince', amount: 750, unit: 'g', original: '750 g beef mince' },
      { name: 'brown onion', amount: 1, unit: '', original: '1 brown onion, finely chopped' },
      { name: 'tinned tomatoes', amount: 400, unit: 'g', original: '400 g tinned tomatoes' },
      { name: 'beef stock', amount: 300, unit: 'ml', original: '300 ml beef stock' },
    ],
  };
  const flags = checkOverlap(copied, RECORD, CAPTURES);
  assert.deepEqual(kinds(flags), ['quantities']);
  assert.equal(flags[0].publisher, 'c.com');
});

test('too few shared ingredients is convergence, not reproduction', () => {
  const thin = {
    ...RECORD,
    canonicalIngredients: RECORD.canonicalIngredients.slice(0, 2),
  };
  // s2 now states only two amounts, and the Recipe matches both — under the
  // floor, two amounts agreeing is two cooks reaching for the same tin.
  const copied = {
    ...CLEAN,
    extendedIngredients: [
      { name: 'beef mince', amount: 750, unit: 'g', original: '750 g beef mince' },
      { name: 'brown onion', amount: 1, unit: '', original: '1 brown onion' },
    ],
  };
  assert.deepEqual(checkOverlap(copied, thin, CAPTURES), []);
});

test('sourceQuantitySets reads the reading stage’s own source tags', () => {
  const sets = sourceQuantitySets(RECORD);
  assert.equal(sets.get(0).get('beef mince'), '500 g');
  assert.equal(sets.get(2).size, 3);
  assert.equal(sets.get(2).has('beef stock'), false);
});

test('the author is handed the Fact Record and nothing else — no source text', async () => {
  const calls = [];
  await authorDish(RECORD, CAPTURES, {
    author: async (...args) => {
      calls.push(args);
      return CLEAN;
    },
  });

  assert.equal(calls.length, 1);
  const [record, notes] = calls[0];
  assert.equal(calls[0].length, 2);
  assert.equal(record, RECORD);
  assert.deepEqual(notes, []);
  // The wall, asserted: no capture's words are reachable from the author's arguments.
  assert.ok(!JSON.stringify(calls).includes('deeply coloured'));
});

test('a flagged Recipe is rewritten and re-checked, never returned with a warning', async () => {
  const drafts = [LIFTED, CLEAN];
  const notes = [];
  const recipe = await authorDish(RECORD, CAPTURES, {
    author: async (_record, rewriteNotes) => {
      notes.push(rewriteNotes);
      return drafts.shift();
    },
  });

  assert.deepEqual(recipe.steps, CLEAN.steps);
  assert.deepEqual(checkOverlap(recipe, RECORD, CAPTURES), []);
  assert.deepEqual(notes[0], []);
  assert.ok(notes[1].length > 0);
  // A rewrite note names the defect, never the span: the flagged run is source
  // text too, and handing it back is what the stage boundary exists to stop.
  assert.ok(!JSON.stringify(notes).includes('deeply coloured'));
});

test('a Recipe that keeps overlapping is dropped, not shipped', async () => {
  let attempts = 0;
  await assert.rejects(
    authorDish(RECORD, CAPTURES, {
      author: async () => {
        attempts++;
        return LIFTED;
      },
    }),
    /OVERLAP_UNRESOLVED/
  );
  assert.equal(attempts, MAX_REWRITES + 1);
});

test('the placeId is frozen from the Fact Record’s slug, not the authored title', async () => {
  const recipe = await authorDish(RECORD, CAPTURES, {
    author: async () => ({ ...CLEAN, placeId: 'owned:something-else' }),
  });
  assert.equal(recipe.placeId, 'owned:beef-ragu');
});

test('the stock kitchen idioms are pre-banned in the author prompt', () => {
  assert.ok(BANNED_IDIOMS.length >= 20);
  for (const idiom of BANNED_IDIOMS) assert.ok(AUTHORING_RULES.includes(idiom), idiom);
});

test('the Fact Record commits alongside its Recipe, and the captures commit nowhere', () => {
  const out = mkdtempSync(join(tmpdir(), 'dinder-corpus-'));
  const dir = commitRecord(out, RECORD, { ...CLEAN, placeId: 'owned:beef-ragu' });

  assert.deepEqual(readdirSync(dir).sort(), ['fact.json', 'recipe.json']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'fact.json'), 'utf8')), RECORD);
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'recipe.json'), 'utf8')).placeId,
    'owned:beef-ragu'
  );
  assert.ok(!readFileSync(join(dir, 'fact.json'), 'utf8').includes('deeply coloured'));
});

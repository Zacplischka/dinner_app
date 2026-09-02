// The tally layer's runnable self-check (#337). Offline: the probe is
// injected, so nothing here reaches Woolworths, Railway or production Redis —
// which is the whole point, because the real measurement is the one thing in
// this pipeline that spends a budget shared with live traffic.
//
// What is worth checking is the grading, and above all the split the spec
// insists on: a line out of the Tally because *this store* does not range the
// ingredient is a fact about store 1101, not a defect in the Recipe.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REFERENCE_STORE_ID,
  liveSessions,
  probePayload,
  railwayProbe,
  tallyGate,
  tallyReport,
} from './tally.mjs';

const recipe = {
  slug: 'beef-ragu',
  recipe: {
    placeId: 'owned:beef-ragu',
    name: 'Beef Ragu',
    ingredients: [
      { name: 'beef mince', amount: 500, unit: 'g', original: '500 g beef mince' },
      { name: 'salt', amount: 5, unit: 'g', original: 'a good pinch of salt' },
      {
        name: 'gluten free vegetable stock',
        searchTerm: 'gluten free vegetable stock',
        amount: 500,
        unit: 'ml',
        original: '500 ml gluten free vegetable stock',
      },
    ],
  },
};

/** One measured line as the container reports it; `searchTerm` follows the name. */
const line = ({ name = 'beef mince', ...changes }) => ({
  name,
  searchTerm: name,
  staple: false,
  outcome: 'matched',
  state: 'priced',
  ...changes,
});

const measured = (lines) => ({ slug: 'beef-ragu', lines });

const probeOf =
  (measurement, storeId = REFERENCE_STORE_ID) =>
  async () => ({
    storeId,
    recipes: [measurement],
  });

test('the probe is sent every ingredient — the store decides which are Staples', () => {
  const [payload] = probePayload([recipe]);
  assert.equal(payload.slug, 'beef-ragu');
  // The Staple rule lives in backend/src/services/staples.ts and runs beside
  // the mint's own copy of it, in production. Filtering here would be a second
  // spelling of it, and the two would drift.
  assert.deepEqual(
    payload.ingredients.map((ingredient) => ingredient.name),
    ['beef mince', 'salt', 'gluten free vegetable stock']
  );
  // searchTerm is what the Matcher searches when the cook-honest name is not
  // matchable (#336); the amount and unit are what the ladder resolves against.
  assert.deepEqual(payload.ingredients[2], {
    name: 'gluten free vegetable stock',
    searchTerm: 'gluten free vegetable stock',
    amount: 500,
    unit: 'ml',
  });
});

test('a Recipe passes when every non-Staple line is Priced or Estimated', () => {
  const report = tallyReport(
    measured([
      line({}),
      line({ name: 'salt', staple: true, outcome: 'skipped', state: 'unmatched' }),
      line({ name: 'stock', state: 'estimated' }),
    ])
  );
  assert.equal(report.passed, true);
  assert.equal(report.inTally, 2);
  assert.equal(report.measured, 2, 'a Staple is outside every Tally and outside this count');
});

test('one out-of-tally line fails the whole Recipe — the gate is per Recipe', () => {
  const report = tallyReport(
    measured([
      ...Array.from({ length: 9 }, () => line({})),
      line({ name: 'curry roux', state: 'unpriced_matched', reason: 'no conversion for "packet"' }),
    ])
  );
  assert.equal(report.passed, false);
  assert.equal(report.inTally, 9);
  assert.deepEqual(report.storeFacts, []);
  assert.match(report.defects[0], /curry roux/);
  assert.match(report.defects[0], /no conversion for "packet"/);
});

test('nothing ranged at the store is a fact about the store, not a defect', () => {
  const report = tallyReport(
    measured([line({ name: 'buk choy', outcome: 'no_product', state: 'unmatched' })])
  );
  assert.equal(report.passed, false, 'the gate is a this-store gate; it still fails');
  assert.deepEqual(report.defects, [], 'the Recipe is not wrong — the store has no buk choy');
  assert.equal(report.storeFacts.length, 1);
  assert.match(report.storeFacts[0], /buk choy/);
  assert.match(report.storeFacts[0], new RegExp(String(REFERENCE_STORE_ID)));
});

test('ranged but priceless, and ranged but out of stock, are the store as well', () => {
  const report = tallyReport(
    measured([
      line({
        name: 'kaffir lime leaves',
        state: 'unpriced_matched',
        reason: 'no price on product',
      }),
      line({
        name: 'thai basil',
        state: 'unpriced_matched',
        reason: 'no price on product',
        available: false,
      }),
    ])
  );
  assert.deepEqual(report.defects, []);
  assert.equal(report.storeFacts.length, 2);
  assert.match(report.storeFacts[1], /not stocked/);
});

test('a search the Retailer refused is unmeasured, and never graded as a defect', () => {
  const report = tallyReport(
    measured([line({}), line({ name: 'lamb leg', outcome: 'failed', state: 'unmatched' })])
  );
  assert.deepEqual(report.defects, []);
  assert.deepEqual(report.storeFacts, []);
  assert.equal(report.unmeasured.length, 1);
  assert.equal(report.passed, false, 'a Recipe nobody finished measuring has not passed');
  assert.equal(report.measured, 1);
});

test('a measurement from any other store is refused outright', async () => {
  await assert.rejects(
    tallyGate([recipe], probeOf(measured([line({})]), 3221)),
    /TALLY_WRONG_STORE.*3221/
  );
});

test('the gate reports every Recipe, and fails only the ones that failed', async () => {
  const two = ['a', 'b'].map((slug) => ({ slug, recipe: { ...recipe.recipe } }));
  const probe = async () => ({
    storeId: REFERENCE_STORE_ID,
    recipes: [
      { slug: 'a', lines: [line({})] },
      { slug: 'b', lines: [line({ state: 'unpriced_matched', reason: 'unparsed pack ""' })] },
    ],
  });
  const { reports } = await tallyGate(two, probe);
  assert.deepEqual(
    reports.map((report) => [report.slug, report.passed]),
    [
      ['a', true],
      ['b', false],
    ]
  );
});

test('a measurement that skipped a Recipe is not that Recipe passing', async () => {
  const two = ['a', 'b'].map((slug) => ({ slug, recipe: { ...recipe.recipe } }));
  const probe = async () => ({
    storeId: REFERENCE_STORE_ID,
    recipes: [{ slug: 'a', lines: [line({})] }],
  });
  await assert.rejects(tallyGate(two, probe), /TALLY_UNMEASURED_RECIPES.*\bb\b/);
});

test('the railway probe runs the measurement in production and reads its one line', async () => {
  const calls = [];
  const answer = { storeId: REFERENCE_STORE_ID, recipes: [] };
  const run = async (command, args) => {
    calls.push([command, args]);
    return {
      // Anything the CLI says on its way in must not be mistaken for a verdict.
      stdout: `Connecting to service...\nTALLY ${JSON.stringify(answer)}\n`,
    };
  };
  assert.deepEqual(await railwayProbe([{ slug: 'a', ingredients: [] }], run), answer);

  const [command, args] = calls[0];
  assert.equal(command, 'railway');
  assert.deepEqual(args.slice(0, 4), ['ssh', 'node', 'scripts/corpus/tally.mjs', 'measure']);
  // Base64 so a shell between here and the container has nothing to chew on.
  assert.deepEqual(JSON.parse(Buffer.from(args[4], 'base64').toString('utf8')), [
    { slug: 'a', ingredients: [] },
  ]);
});

test('the railway probe says so when the container answered with no verdict', async () => {
  const run = async () => ({ stdout: 'error: no active deployment\n' });
  await assert.rejects(railwayProbe([], run), /TALLY_NO_MEASUREMENT/);
});

test('a live Session is live traffic, and the scan stops at the first one', async () => {
  const cursors = { 0: ['17', []], 17: ['42', ['session:ABCD']], 42: ['0', ['session:EFGH']] };
  const seen = [];
  const redis = {
    scan: async (cursor) => {
      seen.push(cursor);
      return cursors[cursor];
    },
  };
  assert.deepEqual(await liveSessions(redis), ['session:ABCD']);
  assert.deepEqual(seen, ['0', '17'], 'no reason to keep scanning once traffic is proven');
});

test('an empty keyspace is a quiet production', async () => {
  const redis = { scan: async () => ['0', []] };
  assert.deepEqual(await liveSessions(redis), []);
});

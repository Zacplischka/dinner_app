// The tally layer's runnable self-check (#337). Offline: the probe is
// injected, so nothing here reaches Woolworths, Railway or production Redis —
// which is the whole point, because the real measurement is the one thing in
// this pipeline that spends a budget shared with live traffic.
//
// What is worth checking is the grading, and above all the split the spec
// insists on: a line out of the Tally because *this store* does not range the
// ingredient is a fact about store 1101, not a defect in the Recipe.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/**
 * One measured line as the container reports it; `searchTerm` follows the name.
 * The store's evidence rides along with every matched line — a stocked, priced,
 * readable, unit-priced product — so a test only says what it changes.
 */
const line = ({ name = 'beef mince', ...changes }) => ({
  name,
  searchTerm: name,
  staple: false,
  outcome: 'matched',
  state: 'priced',
  available: true,
  priced: true,
  packKind: 'fixed',
  unitPriced: true,
  convertFailed: false,
  ...changes,
});

const measured = (lines) => ({ slug: 'beef-ragu', lines });

const probeOf =
  (measurement, storeId = REFERENCE_STORE_ID) =>
  async () => [{ storeId, ...measurement }];

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
        priced: false,
      }),
      line({
        name: 'thai basil',
        state: 'unpriced_matched',
        reason: 'no price on product',
        priced: false,
        available: false,
      }),
    ])
  );
  assert.deepEqual(report.defects, []);
  assert.equal(report.storeFacts.length, 2);
  assert.match(report.storeFacts[1], /not stocked/);
});

test('the store/defect split reads the store, never the ladder’s prose', () => {
  // `reason` is diagnostic prose (shared/types/grocery.ts) and quantityLadder
  // is free to reword it. If a reword can move a line from storeFacts to
  // defects, the layer is grading the store's problem as the author's.
  const report = tallyReport(
    measured([
      line({
        name: 'kaffir lime leaves',
        state: 'unpriced_matched',
        reason: 'the ladder said something else entirely',
        priced: false,
      }),
    ])
  );
  assert.deepEqual(report.defects, []);
  assert.match(report.storeFacts[0], /no price/);
});

test('a pack Woolworths writes unreadably, or prices by nothing, is the store’s', () => {
  const report = tallyReport(
    measured([
      // quantityLadder.ts: `unparsed pack "..."` — Woolworths' own string.
      line({
        name: 'lamb shoulder',
        state: 'unpriced_matched',
        reason: 'unparsed pack "big one"',
        packKind: null,
      }),
      // quantityLadder.ts: `variable pack, no unit price` — no cup price to
      // estimate from, and no rewrite of the Recipe produces one.
      line({
        name: 'whole snapper',
        state: 'unpriced_matched',
        reason: 'variable pack, no unit price',
        packKind: 'variable',
        unitPriced: false,
      }),
    ])
  );
  assert.deepEqual(report.defects, [], 'neither is something an author can restate');
  assert.equal(report.storeFacts.length, 2);
  assert.match(report.storeFacts[0], /pack size nothing can read/);
  assert.match(report.storeFacts[1], /variable pack with no unit price/);
});

test('a line Spoonacular refused is unmeasured — our quota, not their Recipe', () => {
  const report = tallyReport(
    measured([
      line({}),
      line({
        name: 'curry roux',
        state: 'unpriced_matched',
        reason: 'no conversion for "packet"',
        convertFailed: true,
      }),
    ])
  );
  assert.deepEqual(report.defects, [], 'the point ceiling is ours to fix, not the author’s');
  assert.equal(report.unmeasured.length, 1);
  assert.match(report.unmeasured[0], /Spoonacular/);
  assert.equal(report.measured, 1);
  assert.equal(report.passed, false);
});

test('a line that priced anyway is measured, whatever Spoonacular did', () => {
  const report = tallyReport(measured([line({ state: 'estimated', convertFailed: true })]));
  assert.equal(report.passed, true);
  assert.deepEqual(report.unmeasured, []);
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

test('a measurement that names no store is refused the same way', async () => {
  // The container reports null when `woolworths:store` is unset or unreadable —
  // a fresh keyspace, or a re-run inside the price cache's window where nothing
  // cold-fetched. Substituting the configured default would spell 1101 and read
  // as the reference store on no evidence at all.
  await assert.rejects(
    tallyGate([recipe], probeOf(measured([line({})]), null)),
    /TALLY_WRONG_STORE.*no recorded store/
  );
});

test('the gate reports every Recipe, and fails only the ones that failed', async () => {
  const two = ['a', 'b'].map((slug) => ({ slug, recipe: { ...recipe.recipe } }));
  const probe = async () => [
    { storeId: REFERENCE_STORE_ID, slug: 'a', lines: [line({})] },
    {
      storeId: REFERENCE_STORE_ID,
      slug: 'b',
      lines: [line({ state: 'unpriced_matched', reason: 'no bridge' })],
    },
  ];
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
  const probe = async () => [{ storeId: REFERENCE_STORE_ID, slug: 'a', lines: [line({})] }];
  await assert.rejects(tallyGate(two, probe), /TALLY_UNMEASURED_RECIPES.*\bb\b/);
});

test('one Recipe measured at another store is refused, however the run ended', async () => {
  const two = ['a', 'b'].map((slug) => ({ slug, recipe: { ...recipe.recipe } }));
  const probe = async () => [
    { storeId: 3221, slug: 'a', lines: [line({})] },
    { storeId: REFERENCE_STORE_ID, slug: 'b', lines: [line({})] },
  ];
  await assert.rejects(tallyGate(two, probe), /TALLY_WRONG_STORE: a measured at 3221/);
});

test('the railway probe runs the measurement in production and reads a line per Recipe', async () => {
  const calls = [];
  const verdict = (slug) => `TALLY ${JSON.stringify({ storeId: REFERENCE_STORE_ID, slug })}`;
  const run = async (command, args) => {
    calls.push([command, args]);
    return {
      // Anything the CLI says on its way in must not be mistaken for a verdict.
      stdout: `Connecting to service...\n${verdict('a')}\n${verdict('b')}\n`,
    };
  };
  const payload = [
    { slug: 'a', ingredients: [] },
    { slug: 'b', ingredients: [] },
  ];
  assert.deepEqual(
    (await railwayProbe(payload, run)).map((measurement) => measurement.slug),
    ['a', 'b']
  );

  const [command, args] = calls[0];
  assert.equal(command, 'railway');
  assert.deepEqual(args.slice(0, 2), ['ssh', '--']);
  // Base64, as one shell word in a variable: `railway ssh` flattens its argv
  // into a single string the container's bash re-parses, so the payload can
  // carry nothing that shell would chew on and cannot rely on being an argument.
  const [, encoded] = args[2].match(/^P=([A-Za-z0-9+/=]+);/);
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), payload);
});

test('the container finds the script from the backend directory it starts in', async () => {
  // The backend service's Railway root directory is backend/ (that is where
  // railway.json lives, and `node dist/server.js` resolves to backend/dist), so
  // the container's cwd is one level below this script — a repo-root-relative
  // argv would MODULE_NOT_FOUND at the gate's one live use, after the setup is
  // already paid for. Run the argv the probe actually emits, with `node` stubbed.
  const dir = mkdtempSync(join(tmpdir(), 'tally-container-'));
  try {
    mkdirSync(join(dir, 'scripts/corpus'), { recursive: true });
    writeFileSync(join(dir, 'scripts/corpus/tally.mjs'), '');
    mkdirSync(join(dir, 'backend/bin'), { recursive: true });
    writeFileSync(join(dir, 'backend/bin/node'), '#!/bin/sh\necho "$@"\n', { mode: 0o755 });

    let argv;
    const run = async (_command, args) => {
      argv = args;
      return { stdout: `TALLY ${JSON.stringify({ storeId: REFERENCE_STORE_ID, slug: 'a' })}\n` };
    };
    await railwayProbe([{ slug: 'a', ingredients: [] }], run);

    // What `railway ssh` does with the argv: joins it into one string and hands
    // that to the container's shell. A script that only works quoted dies here.
    const invoked = execFileSync('/bin/sh', ['-c', argv.slice(2).join(' ')], {
      cwd: join(dir, 'backend'),
      env: { PATH: join(dir, 'backend/bin') },
    }).toString();
    assert.match(invoked, /^\.\.\/scripts\/corpus\/tally\.mjs measure /, invoked);
    assert.deepEqual(
      JSON.parse(Buffer.from(invoked.trim().split(' ')[2], 'base64').toString('utf8')),
      [{ slug: 'a', ingredients: [] }]
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a run that died mid-line keeps every Recipe it finished printing', async () => {
  // The truncated tail still starts with `TALLY `, and throwing on it would
  // discard exactly the measurements the .catch above it exists to keep.
  const run = async () => {
    const error = new Error('ssh: connection closed by remote host');
    error.stdout =
      `TALLY ${JSON.stringify({ storeId: REFERENCE_STORE_ID, slug: 'a', lines: [] })}\n` +
      `TALLY {"storeId":1101,"slug":"b","li`;
    throw error;
  };
  const measurements = await railwayProbe([{ slug: 'a' }, { slug: 'b' }], run);
  assert.deepEqual(
    measurements.map((measurement) => measurement.slug),
    ['a'],
    'the half-written Recipe is unmeasured, not fatal'
  );
});

test('a run that died keeps the Recipes it had already measured', async () => {
  // The budget those lines cost is the one thing this file cannot re-spend, so
  // a dropped session must not throw them away — the gate names the rest.
  const run = async () => {
    const error = new Error('ssh: connection closed by remote host');
    error.stdout = `TALLY ${JSON.stringify({ storeId: REFERENCE_STORE_ID, slug: 'a', lines: [] })}\n`;
    throw error;
  };
  const two = ['a', 'b'].map((slug) => ({ slug, recipe: { ...recipe.recipe } }));
  await assert.rejects(
    tallyGate(two, (payload) => railwayProbe(payload, run)),
    /TALLY_UNMEASURED_RECIPES: b/
  );
});

test('a run that died before measuring anything is the error it died of', async () => {
  const run = async () => {
    const error = new Error('ssh: no active deployment');
    error.stdout = '';
    throw error;
  };
  await assert.rejects(railwayProbe([{ slug: 'a', ingredients: [] }], run), /no active deployment/);
});

test('the railway probe says so when the container answered with no verdict', async () => {
  const run = async () => ({ stdout: 'error: no active deployment\n' });
  await assert.rejects(railwayProbe([{ slug: 'a', ingredients: [] }], run), /TALLY_NO_MEASUREMENT/);
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

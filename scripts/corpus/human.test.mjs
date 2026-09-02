// The human layer's runnable self-check (#337). Entirely offline — the layer
// is sampling and bookkeeping, and the only thing worth checking is that the
// sample is stratified, deterministic and honest about what it did not see.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_CUISINE, REVIEW_FRACTION, cuisineBucket, review, reviewSample } from './human.mjs';

/** A batch: `count` Recipes in one cuisine bucket, slugs numbered from 1. */
const batch = (cuisine, count, prefix = cuisine) =>
  Array.from({ length: count }, (_, index) => ({
    slug: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    cuisine,
  }));

const slugs = (sample) => [...sample.values()].flat().sort();

const allPassing = (sample) => Object.fromEntries(slugs(sample).map((slug) => [slug, true]));

test('the sample is a tenth of the batch', () => {
  const recipes = batch('italian', 100);
  const sample = reviewSample(recipes);
  assert.equal(slugs(sample).length, 100 * REVIEW_FRACTION);
});

test('every cuisine bucket is sampled, however small', () => {
  const recipes = [...batch('italian', 60), ...batch('korean', 3), ...batch('greek', 1)];
  const sample = reviewSample(recipes);
  assert.deepEqual([...sample.keys()].sort(), ['greek', 'italian', 'korean']);
  // A bucket of one is one review: stratification exists so no cuisine goes
  // unseen, and rounding a small stratum to zero is exactly that failure.
  assert.deepEqual(sample.get('greek'), ['greek-01']);
  assert.deepEqual(sample.get('korean'), ['korean-01']);
  assert.equal(sample.get('italian').length, 6);
});

test('a Recipe with no cuisine is its own stratum, not a hole in another', () => {
  const recipes = [...batch('italian', 10), ...batch(undefined, 10, 'plain')];
  const sample = reviewSample(recipes);
  assert.deepEqual([...sample.keys()].sort(), [NO_CUISINE, 'italian']);
  assert.equal(cuisineBucket({ slug: 'plain-01' }), NO_CUISINE);
});

test('the sample is spread across the stratum, and the same batch samples the same', () => {
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  assert.deepEqual(sample.get('italian'), ['italian-01', 'italian-11', 'italian-21']);
  assert.deepEqual(reviewSample(recipes), sample);
  // Order of arrival is not a fact about the corpus, so it must not move the sample.
  assert.deepEqual(reviewSample([...recipes].reverse()), sample);
});

test('a stratum whose sample all passes is done', () => {
  const recipes = [...batch('italian', 30), ...batch('korean', 30)];
  const sample = reviewSample(recipes);
  const report = review(recipes, allPassing(sample));
  assert.deepEqual(
    report.map((entry) => entry.action),
    ['pass', 'pass']
  );
  assert.equal(report[0].failed.length, 0);
});

test('one failure reviews the rest of that stratum, and only that stratum', () => {
  const recipes = [...batch('italian', 30), ...batch('korean', 30)];
  const sample = reviewSample(recipes);
  const report = review(recipes, { ...allPassing(sample), 'italian-01': false });

  const italian = report.find((entry) => entry.bucket === 'italian');
  assert.equal(italian.action, 'review-stratum');
  assert.deepEqual(italian.failed, ['italian-01']);
  // The rest of the bucket, minus the three already looked at.
  assert.equal(italian.recipes.length, 27);
  assert.ok(!italian.recipes.includes('italian-01'));

  assert.equal(report.find((entry) => entry.bucket === 'korean').action, 'pass');
});

test('two failures re-gate the whole stratum, the reviewed Recipes included', () => {
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  const report = review(recipes, {
    ...allPassing(sample),
    'italian-01': false,
    'italian-11': false,
  });
  assert.equal(report[0].action, 're-gate-stratum');
  assert.equal(report[0].recipes.length, 30);
  assert.deepEqual(report[0].failed, ['italian-01', 'italian-11']);
});

test('a sampled Recipe nobody reviewed is not a pass', () => {
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  const partial = allPassing(sample);
  delete partial['italian-11'];
  assert.throws(() => review(recipes, partial), /HUMAN_REVIEW_INCOMPLETE.*italian-11/);
});

test('a verdict about a Recipe nobody sampled is a typo, not a verdict', () => {
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  assert.throws(
    () => review(recipes, { ...allPassing(sample), 'italian-02': false }),
    /HUMAN_REVIEW_UNSAMPLED.*italian-02/
  );
});

test('the escalated round’s verdicts are verdicts — the stratum was opened by its failure', () => {
  // `review-stratum` sends 27 more Recipes to a person. If reading them cannot
  // be recorded, the one-failure rule has no way to finish.
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  const report = review(recipes, {
    ...allPassing(sample),
    'italian-01': false,
    'italian-02': true,
    'italian-03': true,
  });
  assert.equal(report[0].action, 'review-stratum');
  assert.deepEqual(report[0].failed, ['italian-01']);
  assert.equal(report[0].recipes.length, 25, 'what is still unread, sample and escalation aside');
  assert.ok(!report[0].recipes.includes('italian-02'));
});

test('a second failure found in the escalated round re-gates the stratum', () => {
  // The rule the escalation exists for: two is not bad luck, it is a bad batch.
  const recipes = batch('italian', 30);
  const sample = reviewSample(recipes);
  const report = review(recipes, {
    ...allPassing(sample),
    'italian-01': false,
    'italian-07': false,
  });
  assert.equal(report[0].action, 're-gate-stratum');
  assert.deepEqual(report[0].failed, ['italian-01', 'italian-07']);
  assert.equal(report[0].recipes.length, 30, 'the reviewed Recipes go back through too');
});

test('a whole stratum read out with one failure has nothing left to read, and still fails', () => {
  const recipes = batch('italian', 30);
  const verdicts = Object.fromEntries(recipes.map(({ slug }) => [slug, true]));
  const report = review(recipes, { ...verdicts, 'italian-01': false });
  assert.equal(report[0].action, 'review-stratum');
  assert.deepEqual(report[0].recipes, []);
});

test('a stratum that never escalated does not accept verdicts from another one', () => {
  const recipes = [...batch('italian', 30), ...batch('korean', 30)];
  const sample = reviewSample(recipes);
  assert.throws(
    () => review(recipes, { ...allPassing(sample), 'italian-01': false, 'korean-02': true }),
    /HUMAN_REVIEW_UNSAMPLED.*korean-02/
  );
});

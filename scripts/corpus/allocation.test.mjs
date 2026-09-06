// The allocation's runnable self-check (#341). Entirely offline: the layer is
// arithmetic over a batch, and what is worth checking is that a corpus short
// of a target says so — a report that quietly passes an empty bucket is worse
// than no report.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DECK_FLOOR,
  DIET_TARGETS,
  MAIN_ALLOCATION,
  NON_MAIN_ALLOCATION,
  TOP_CUISINES,
  shortfalls,
} from './allocation.mjs';
import { CUISINES, DIETS, MEAL_TYPES } from './gate.mjs';

const sum = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);

/** `count` mains in one cuisine, all carrying `diets`. */
const mains = (cuisine, count, diets = []) =>
  Array.from({ length: count }, () => ({ cuisine, mealType: 'main course', diets }));

/** A corpus that meets the allocation exactly, with no diet tagged anywhere. */
const allocated = () => [
  ...Object.entries(MAIN_ALLOCATION).flatMap(([cuisine, count]) => mains(cuisine, count)),
  ...Object.entries(NON_MAIN_ALLOCATION).flatMap(([mealType, count]) =>
    Array.from({ length: count }, () => ({ mealType, diets: [] }))
  ),
];

/** The `what`s reported, so a case can assert on one without ordering. */
const reported = (recipes) => shortfalls(recipes).map((entry) => entry.what);

test('the allocation is the numbers #312 resolved on', () => {
  assert.equal(sum(MAIN_ALLOCATION), 915);
  assert.equal(sum(NON_MAIN_ALLOCATION), 245);
});

test('every bucket is a chip, and every chip has a bucket', () => {
  // The counts are #312's judgement and have to be written down, but the keys
  // they hang off are the chip vocabularies gate.mjs already reads out of
  // shared/types/cook.ts. Asserted rather than copied: a chip added there, or a
  // bucket misspelled here, fails this instead of reporting `spainsh: 0/30`
  // forever. `modern australian` is the exception until #340 ships the chip.
  const sorted = (names) => [...names].sort();
  assert.deepEqual(
    sorted(Object.keys(MAIN_ALLOCATION)),
    sorted(new Set([...CUISINES, 'modern australian']))
  );
  assert.deepEqual(
    sorted(Object.keys(NON_MAIN_ALLOCATION)),
    sorted(MEAL_TYPES.filter((mealType) => mealType !== 'main course'))
  );
  // Pescetarian is the one chip with no target: `vegan ⊆ vegetarian ⊆
  // pescetarian` means it is answered by dishes authored anyway, and the Deck
  // floor below is what holds it honest.
  assert.deepEqual(sorted([...Object.keys(DIET_TARGETS), 'pescetarian']), sorted(DIETS));
});

test('an empty corpus is short of everything, bucket by bucket', () => {
  const what = reported([]);
  for (const cuisine of Object.keys(MAIN_ALLOCATION)) assert.ok(what.includes(cuisine));
  for (const mealType of Object.keys(NON_MAIN_ALLOCATION)) assert.ok(what.includes(mealType));
  assert.ok(what.includes('corpus'));
});

test('a bucket one Recipe short of its floor is reported, with both numbers', () => {
  let dropped = false;
  const short = allocated().filter((recipe) => {
    if (dropped || recipe.cuisine !== 'spanish') return true;
    dropped = true;
    return false;
  });
  const spanish = shortfalls(short).find((entry) => entry.what === 'spanish');
  assert.deepEqual(spanish, {
    what: 'spanish',
    have: MAIN_ALLOCATION.spanish - 1,
    want: MAIN_ALLOCATION.spanish,
  });
});

test('surplus above a target is not a shortfall', () => {
  const generous = [...allocated(), ...mains('spanish', 40)];
  assert.ok(!reported(generous).includes('spanish'));
});

test('gluten free under 45% of mains is reported', () => {
  const bare = allocated();
  assert.ok(reported(bare).includes('gluten free'));

  const tagged = [
    ...Object.entries(MAIN_ALLOCATION).flatMap(([cuisine, count]) => [
      ...mains(cuisine, Math.ceil(count * 0.45), ['gluten free']),
      ...mains(cuisine, count - Math.ceil(count * 0.45)),
    ]),
    ...allocated().filter((recipe) => recipe.mealType !== 'main course'),
  ];
  assert.ok(!reported(tagged).includes('gluten free'));
});

test('vegetarian carries a floor of 15 in each of the top six cuisines', () => {
  // A quarter of every bucket vegetarian clears the corpus-wide 25%, but the
  // sixth-largest bucket is small enough that a quarter of it is under 15.
  const quartered = [
    ...Object.entries(MAIN_ALLOCATION).flatMap(([cuisine, count]) => [
      ...mains(cuisine, Math.round(count * 0.25), ['vegetarian']),
      ...mains(cuisine, count - Math.round(count * 0.25)),
    ]),
    ...allocated().filter((recipe) => recipe.mealType !== 'main course'),
  ];
  const thin = TOP_CUISINES.filter((cuisine) => Math.round(MAIN_ALLOCATION[cuisine] * 0.25) < 15);
  assert.ok(thin.length, 'the top six should include a bucket a flat quarter cannot fill');
  for (const cuisine of thin) {
    assert.ok(reported(quartered).includes(`vegetarian in ${cuisine}`));
  }
});

test('a diet chip that cannot deal a full Deck from owned alone is reported', () => {
  const short = [...allocated().filter((r) => r.mealType !== 'main course'), ...mains('thai', 900)];
  const paleo = shortfalls(short).find((entry) => entry.what === 'paleo deals alone');
  assert.deepEqual(paleo, { what: 'paleo deals alone', have: 0, want: DECK_FLOOR });
});

test('vegan mains answer the vegetarian and pescetarian chips', () => {
  // `vegan ⊆ vegetarian ⊆ pescetarian`: a corpus with no record tagged
  // pescetarian still deals a full pescetarian Deck off its vegan ones.
  const veganOnly = [
    ...allocated().filter((recipe) => recipe.mealType !== 'main course'),
    ...mains('italian', DECK_FLOOR, ['vegan']),
  ];
  const what = reported(veganOnly);
  assert.ok(!what.includes('pescetarian deals alone'));
  assert.ok(!what.includes('vegetarian deals alone'));
  assert.ok(!what.includes('vegan deals alone'));
});

test('a non-main meal type short of its target is reported', () => {
  const noSnacks = allocated().filter((recipe) => recipe.mealType !== 'snack');
  const snack = shortfalls(noSnacks).find((entry) => entry.what === 'snack');
  assert.deepEqual(snack, { what: 'snack', have: 0, want: NON_MAIN_ALLOCATION.snack });
});

test('an untagged main counts towards no bucket', () => {
  const stray = [
    ...allocated().filter((recipe) => recipe.cuisine !== 'spanish'),
    ...mains(undefined, MAIN_ALLOCATION.spanish),
  ];
  assert.ok(reported(stray).includes('spanish'));
});

// The allocation's runnable self-check (#341). Entirely offline: the layer is
// arithmetic over a batch, and what is worth checking is that a corpus short
// of a target says so — a report that quietly passes an empty bucket is worse
// than no report.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DECK_FLOOR,
  DIET_TARGETS,
  IMPLIED,
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
  // Pescetarian is the one chip with no count of its own: `vegan ⊆ vegetarian ⊆
  // pescetarian` means it is answered by dishes authored anyway. It still
  // carries a target, because the Deck floors are what hold it honest.
  assert.deepEqual(sorted(Object.keys(DIET_TARGETS)), sorted(DIETS));
});

test('the diet implication agrees with the store that owns it', () => {
  // `IMPLIED` is copied out of ownedRecipeStore.ts because plain Node cannot
  // import the TypeScript. Read the store's copy back off the source — the
  // trick gate.mjs already uses for STAPLES and the US→AU table — so a drift
  // fails here instead of quietly moving every diet number in the report.
  const store = readFileSync(
    new URL('../../backend/src/services/ownedRecipeStore.ts', import.meta.url),
    'utf8'
  );
  const literal = /const IMPLIED[^=]*=\s*\{([^}]*)\}/.exec(store);
  assert.ok(literal, 'IMPLIED is no longer an object literal in ownedRecipeStore.ts');
  const owned = Object.fromEntries(
    [...literal[1].matchAll(/^\s*'?([\w ]+)'?\s*:\s*\[([^\]]*)\]/gm)].map(([, diet, list]) => [
      diet,
      [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    ])
  );
  assert.deepEqual(owned, IMPLIED);
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

  // Deliberate, and the reason DIET_TARGETS says so: every number in the
  // allocation is a floor. #312 also caps keto and paleo at "roughly 20, no
  // more", and this report does not hold that half — 200 paleo mains, all in
  // one cuisine, still reads `allocation met`.
  const overshot = [...allocated(), ...mains('thai', 200, ['paleo'])];
  assert.ok(!reported(overshot).includes('paleo'));
});

test('the three crosses #312 promises are scored, and no others', () => {
  // "diet + cuisine deals a full Deck only for gluten free, pescetarian and
  // vegetarian, and only in the top 6 cuisines" — so a corpus that meets every
  // bucket and every corpus-wide diet count can still be short in a cross.
  const crossed = (what) => what.filter((entry) => entry.includes(' in '));
  assert.deepEqual(
    new Set(crossed(reported([])).map((entry) => entry.split(' in ')[0])),
    new Set(['gluten free', 'pescetarian', 'vegetarian'])
  );

  // Gluten free tagged everywhere but one top-six bucket: the corpus-wide 45%
  // is met and the cross is not, which is the whole reason the cross is scored.
  const lopsided = [
    ...Object.entries(MAIN_ALLOCATION).flatMap(([cuisine, count]) =>
      mains(cuisine, count, cuisine === 'mexican' ? [] : ['gluten free'])
    ),
    ...allocated().filter((recipe) => recipe.mealType !== 'main course'),
  ];
  const what = reported(lopsided);
  assert.ok(!what.includes('gluten free'), '860 of 915 mains clear the 45%');
  assert.ok(what.includes('gluten free in mexican'));
  assert.ok(!what.includes('gluten free in italian'));
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

test('an untagged main counts towards no bucket, and is named as such', () => {
  const stray = [
    ...allocated().filter((recipe) => recipe.cuisine !== 'spanish'),
    ...mains(undefined, MAIN_ALLOCATION.spanish),
  ];
  const what = reported(stray);
  assert.ok(what.includes('spanish'));
  // It raises every fractionOfMains target and the corpus total while filling
  // no bucket, so the report has to name it or a run cannot find it.
  assert.deepEqual(
    shortfalls(stray).find((entry) => entry.what === 'unbucketed mains'),
    {
      what: 'unbucketed mains',
      have: MAIN_ALLOCATION.spanish,
      want: 0,
    }
  );
  assert.ok(!reported(allocated()).includes('unbucketed mains'));
});

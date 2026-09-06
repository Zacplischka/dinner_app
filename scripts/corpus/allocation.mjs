// What the corpus is *for*: the allocation #312 resolved on, written down as
// data, and the report that scores a corpus directory against it (#341).
//
// The four gate layers judge one Recipe at a time. Nothing judged the batch as
// a whole, so "every bucket reaches its floor" and "no chip deals fewer than
// 15" had nowhere to be checked and nowhere to be read — a bucket run had no
// number to author to, and #341 had no close condition but a count. This is
// that number, in one place, so a child ticket per bucket can be minted from
// it and a run can tell when it is finished.
//
// The numbers are #312's, not a fresh guess: a flat floor of 30 mains per
// cuisine consumes 450 of the 915 before demand gets a vote, and the surplus
// above the floor is demand-weighted from ABS/MJA/MLA and first-party ranking
// evidence. Diet is mostly a tagging convention rather than dishes of its own —
// gluten free and pescetarian cost nothing, vegetarian and vegan are floors on
// existing dishes, and only ketogenic and paleo are authored blocks.
//
//   node scripts/corpus/allocation.mjs report <recordsDir>

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordSlugs } from './records.mjs';
import { cuisineBucket } from './human.mjs';

/** 915 mains, cuisine bucket → count. The counts are #312's judgement, but the
 *  keys are the chip vocabulary — allocation.test.mjs asserts them against the
 *  `CUISINES` gate.mjs reads out of `shared/types/cook.ts`, so a chip added
 *  there fails until it has a number here. `modern australian` is the chip #340
 *  ships; until it does, its records carry no cuisine and are named in the
 *  corpus's own `pending-cuisine.json`, which the CLI below folds in. */
export const MAIN_ALLOCATION = {
  'modern australian': 150,
  italian: 110,
  chinese: 90,
  indian: 90,
  thai: 65,
  mexican: 55,
  japanese: 50,
  greek: 45,
  vietnamese: 45,
  'middle eastern': 45,
  korean: 40,
  mediterranean: 35,
  american: 35,
  french: 30,
  spanish: 30,
};

/** 245 across the other meal types, cuisine-agnostic: these relax on cuisine,
 *  so nothing here is allocated per bucket. */
export const NON_MAIN_ALLOCATION = {
  dessert: 55,
  salad: 45,
  'side dish': 45,
  soup: 40,
  breakfast: 35,
  snack: 25,
};

/** One full Deck. `RECIPE_DECK_SIZE` is 15, so this is the floor a single chip
 *  must clear from owned alone. */
export const DECK_FLOOR = 15;

/** The six largest buckets, derived rather than listed: the vegetarian floor
 *  is defined as "the top six", and two spellings of that could disagree. */
export const TOP_CUISINES = Object.entries(MAIN_ALLOCATION)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 6)
  .map(([cuisine]) => cuisine);

/**
 * Diet coverage, all of it measured over mains. Gluten free is the highest-
 * value convention in the corpus and pescetarian is free, so neither buys
 * dishes; vegetarian and vegan are floors on dishes authored anyway; only
 * ketogenic and paleo are blocks authored for the chip.
 *
 * Every number here is a floor, as is every number in the two allocations
 * above. #312 also caps the keto and paleo blocks — "roughly 20, deliberately
 * cuisine-agnostic, no more" — and that half is an authoring rule this report
 * does not hold: nothing in the instrument is a ceiling, so 200 paleo mains,
 * all of them thai, still reads `allocation met`.
 */
export const DIET_TARGETS = {
  'gluten free': { fractionOfMains: 0.45, floorInTopCuisines: DECK_FLOOR },
  vegetarian: { fractionOfMains: 0.25, floorInTopCuisines: DECK_FLOOR },
  vegan: { fractionOfMains: 0.1 },
  ketogenic: { mains: 20 },
  paleo: { mains: 20 },
  /** No count of its own — `vegan ⊆ vegetarian ⊆ pescetarian` answers it off
   *  dishes authored anyway — but #312's rule names it in the three crosses
   *  that must deal, so the top six are scored for it. */
  pescetarian: { floorInTopCuisines: DECK_FLOOR },
};

/** `vegan ⊆ vegetarian ⊆ pescetarian`, mirrored from the store's `IMPLIED` —
 *  the pipeline is plain Node with no build step, so it cannot import the
 *  TypeScript that owns it. Exported only so allocation.test.mjs can read the
 *  store's copy off the source and fail when the two drift; a silent drift here
 *  changes the diet numbers a whole authoring run is steered by. */
export const IMPLIED = { vegan: ['vegetarian', 'pescetarian'], vegetarian: ['pescetarian'] };

const satisfies = (diets) => new Set(diets.flatMap((diet) => [diet, ...(IMPLIED[diet] ?? [])]));

const shortfall = (what, have, want) => (have < want ? [{ what, have, want }] : []);

/**
 * Every way the corpus is still short of the allocation, as `{ what, have,
 * want }` — empty when #341 is done. `recipes` is `{ cuisine, mealType, diets }`
 * per record; nothing here touches disk, so the whole thing is checkable
 * offline against a batch that does not exist yet.
 */
export function shortfalls(recipes) {
  const mains = recipes.filter((recipe) => recipe.mealType === 'main course');
  const inBucket = (cuisine) => mains.filter((recipe) => cuisineBucket(recipe) === cuisine);
  const tagged = (pool, diet) => pool.filter((recipe) => satisfies(recipe.diets).has(diet)).length;

  // A main whose bucket is in neither the allocation nor `pending-cuisine.json`
  // raises every `fractionOfMains` target and the corpus total while counting
  // towards no bucket, so it can satisfy no line in the report. Reported as a
  // want of zero rather than a shortfall — it is the one gap you close by
  // tagging records rather than by authoring them.
  const unbucketed = mains.filter(
    (recipe) => !Object.hasOwn(MAIN_ALLOCATION, cuisineBucket(recipe))
  ).length;

  return [
    ...Object.entries(MAIN_ALLOCATION).flatMap(([cuisine, want]) =>
      shortfall(cuisine, inBucket(cuisine).length, want)
    ),
    ...(unbucketed ? [{ what: 'unbucketed mains', have: unbucketed, want: 0 }] : []),
    ...Object.entries(NON_MAIN_ALLOCATION).flatMap(([mealType, want]) =>
      shortfall(mealType, recipes.filter((recipe) => recipe.mealType === mealType).length, want)
    ),
    ...Object.entries(DIET_TARGETS).flatMap(([diet, target]) => {
      const overMains = target.mains ?? Math.ceil(mains.length * target.fractionOfMains);
      return [
        ...(Number.isFinite(overMains) ? shortfall(diet, tagged(mains, diet), overMains) : []),
        ...(target.floorInTopCuisines === undefined
          ? []
          : TOP_CUISINES.flatMap((cuisine) =>
              shortfall(
                `${diet} in ${cuisine}`,
                tagged(inBucket(cuisine), diet),
                target.floorInTopCuisines
              )
            )),
      ];
    }),
    // "No Craving in the chip vocabulary deals fewer than 15 from owned alone",
    // as #312 narrowed the promise: every diet chip on its own, and crossed
    // with a cuisine only for `gluten free`, `pescetarian` and `vegetarian` in
    // the top six — those three crosses are the `floorInTopCuisines` above. A
    // meal type alone and a cuisine alone are already floored by the two
    // allocations; the diet chips are the ones a bucket run can reach its own
    // floor and still leave empty.
    ...Object.keys(DIET_TARGETS).flatMap((diet) =>
      shortfall(`${diet} deals alone`, tagged(mains, diet), DECK_FLOOR)
    ),
    ...shortfall(
      'corpus',
      recipes.length,
      Object.values(MAIN_ALLOCATION).reduce((a, b) => a + b, 0) +
        Object.values(NON_MAIN_ALLOCATION).reduce((a, b) => a + b, 0)
    ),
  ];
}

// ------------------------------------------------------- the CLI

/**
 * Every `<recordsDir>/<slug>/recipe.json` as the three fields the allocation
 * counts. A record named in `pending-cuisine.json` is counted in the bucket it
 * is pending — otherwise the largest bucket in the allocation reads zero until
 * #340 ships the chip, and the report lies about where the corpus stands.
 */
function loadBatch(recordsDir) {
  const pendingFile = join(recordsDir, 'pending-cuisine.json');
  const pending = new Map(
    existsSync(pendingFile)
      ? Object.entries(JSON.parse(readFileSync(pendingFile, 'utf8'))).flatMap(([cuisine, slugs]) =>
          slugs.map((slug) => [slug, cuisine])
        )
      : []
  );
  return recordSlugs(recordsDir).map((slug) => {
    const recipe = JSON.parse(readFileSync(join(recordsDir, slug, 'recipe.json'), 'utf8'));
    return {
      cuisine: recipe.cuisine ?? pending.get(slug),
      mealType: recipe.mealType,
      diets: recipe.diets ?? [],
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, recordsDir] = process.argv.slice(2);
  if (command !== 'report' || !recordsDir) {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(2);
  }
  const gaps = shortfalls(loadBatch(recordsDir));
  for (const gap of gaps) console.log(`${gap.what}: ${gap.have}/${gap.want}`);
  console.log(gaps.length ? `\n${gaps.length} short of the allocation` : '\nallocation met');
  if (gaps.length) process.exitCode = 1;
}

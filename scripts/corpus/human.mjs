// The corpus pipeline's fourth and last gate layer (#337): human review. The
// three machine layers before it — structural and culinary (`gate.mjs`), then
// tally (`tally.mjs`) — are exhaustive and cheap enough to run over everything.
// This one is a person reading Recipes, so it is a *sample*: 10% of the batch,
// stratified by cuisine bucket, with the batch's own numbers deciding what a
// failure means.
//
//   - **Stratified** because a corpus failure mode is rarely spread evenly. The
//     pilot's defects clustered by cuisine — one authoring brief, one set of
//     assumptions, one trap — so a flat 10% can miss a whole bad cuisine while
//     over-reading a good one. Every non-empty bucket is sampled, however small.
//   - **One failure reviews that stratum**: the rest of the bucket goes to a
//     person, because one defect in a sample of three is not evidence of one
//     defect.
//   - **Two failures re-gate it**: the bucket goes back through the machine
//     layers and is re-authored, the already-reviewed Recipes included. Two is
//     not bad luck; it is a bad batch, and ADR 0011's answer to a bad batch is
//     that it never ships.
//
// Nothing here is a judgement about a Recipe — the person makes those. This is
// the bookkeeping around them, which is the part that must not quietly round a
// small cuisine away or read a missing verdict as a pass.
//
//   node scripts/corpus/human.mjs sample  <recordsDir>
//   node scripts/corpus/human.mjs verdict <recordsDir> <reviews.json>

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 10% of the batch — the spec's number, and the pilot's reading budget. */
export const REVIEW_FRACTION = 0.1;

/** A Recipe carries at most one cuisine; the ones with none are one bucket. */
export const NO_CUISINE = '(no cuisine)';

export const cuisineBucket = (recipe) => recipe.cuisine ?? NO_CUISINE;

/** Bucket → its slugs, sorted, so arrival order is never a fact about a batch. */
export function strata(recipes) {
  const buckets = new Map();
  for (const recipe of recipes) {
    const bucket = cuisineBucket(recipe);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), recipe.slug]);
  }
  for (const [bucket, slugs] of buckets) buckets.set(bucket, slugs.sort());
  return new Map([...buckets].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Who gets read: bucket → the slugs sampled out of it.
 *
 * A stratum yields `ceil(n × 10%)`, never fewer than one, and the picks are
 * spread at an even stride rather than taken off the front — an author works a
 * cuisine in order, so the first three of a bucket are the three most alike.
 *
 * ponytail: ceiling per stratum, so a batch of many small buckets reviews a
 * little over 10% overall. That is what stratifying costs, and reading a few
 * extra Recipes is the cheap side of the trade.
 */
export function reviewSample(recipes, fraction = REVIEW_FRACTION) {
  const sample = new Map();
  for (const [bucket, slugs] of strata(recipes)) {
    const take = Math.max(1, Math.ceil(slugs.length * fraction));
    sample.set(
      bucket,
      Array.from({ length: take }, (_, index) => slugs[Math.floor((index * slugs.length) / take)])
    );
  }
  return sample;
}

/**
 * The sample's verdicts turned into what happens to each bucket. `reviewed` is
 * slug → whether the person passed the Recipe; it must cover the sample exactly,
 * because a missing verdict is silence and silence is not a pass.
 */
export function review(recipes, reviewed, fraction = REVIEW_FRACTION) {
  const sample = reviewSample(recipes, fraction);
  const sampled = new Set([...sample.values()].flat());

  const unsampled = Object.keys(reviewed).filter((slug) => !sampled.has(slug));
  if (unsampled.length) {
    throw new Error(`HUMAN_REVIEW_UNSAMPLED: ${unsampled.join(', ')} — nobody was asked to read`);
  }
  const missing = [...sampled].filter((slug) => reviewed[slug] === undefined);
  if (missing.length) {
    throw new Error(`HUMAN_REVIEW_INCOMPLETE: no verdict for ${missing.join(', ')}`);
  }

  const buckets = strata(recipes);
  return [...sample].map(([bucket, slugs]) => {
    const failed = slugs.filter((slug) => !reviewed[slug]);
    const all = buckets.get(bucket);
    if (failed.length >= 2) {
      return { bucket, sampled: slugs, failed, action: 're-gate-stratum', recipes: all };
    }
    if (failed.length === 1) {
      const rest = all.filter((slug) => !slugs.includes(slug));
      return { bucket, sampled: slugs, failed, action: 'review-stratum', recipes: rest };
    }
    return { bucket, sampled: slugs, failed, action: 'pass', recipes: [] };
  });
}

// ------------------------------------------------------- the CLI

/** Every `<recordsDir>/<slug>/recipe.json`, as `{ slug, cuisine }`. */
export function loadBatch(recordsDir) {
  return readdirSync(recordsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(recordsDir, entry.name, 'recipe.json'))
    )
    .map((entry) => ({
      slug: entry.name,
      cuisine: JSON.parse(readFileSync(join(recordsDir, entry.name, 'recipe.json'), 'utf8'))
        .cuisine,
    }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, recordsDir, reviewsPath] = process.argv.slice(2);
  if (!recordsDir || (command === 'verdict' && !reviewsPath)) {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(2);
  }
  const recipes = loadBatch(recordsDir);

  if (command === 'sample') {
    for (const [bucket, slugs] of reviewSample(recipes)) {
      console.log(`${bucket}: ${slugs.join(' ')}`);
    }
    console.log(
      `\n${[...reviewSample(recipes).values()].flat().length}/${recipes.length} to read — ` +
        'answer with {"<slug>": true|false} for every one of them'
    );
  } else if (command === 'verdict') {
    const report = review(recipes, JSON.parse(readFileSync(reviewsPath, 'utf8')));
    for (const entry of report) {
      console.log(
        `${entry.bucket}: ${entry.action}` +
          (entry.failed.length ? ` (failed: ${entry.failed.join(', ')})` : '') +
          (entry.recipes.length ? `\n  ${entry.recipes.join(' ')}` : '')
      );
    }
    if (report.some((entry) => entry.action !== 'pass')) process.exitCode = 1;
  } else {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(2);
  }
}

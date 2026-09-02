// What a corpus directory holds, for the three gate layers that walk it
// (`gate.mjs`, `tally.mjs`, `human.mjs`). One spelling of "a record is a
// `<slug>/recipe.json`" and one spelling of the typo guard, because a run that
// quietly shrinks to nothing is a run that reports a pass it never made.
//
// Node built-ins only, on purpose: `tally.mjs` imports this inside the
// production container, where the pipeline's dev dependencies do not exist.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `<recordsDir>/<slug>/recipe.json` in slug order, or just the named
 * slugs. A named slug with no record throws: a typo must never quietly shrink
 * a gate run into a pass. Reading the JSON is each caller's own business —
 * the three layers want different fields out of it.
 */
export function recordSlugs(recordsDir, slugs = []) {
  const present = readdirSync(recordsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(recordsDir, entry.name, 'recipe.json'))
    )
    .map((entry) => entry.name);
  if (!slugs.length) return present.sort();
  for (const slug of slugs) {
    if (!present.includes(slug)) throw new Error(`no ${join(recordsDir, slug, 'recipe.json')}`);
  }
  return slugs;
}

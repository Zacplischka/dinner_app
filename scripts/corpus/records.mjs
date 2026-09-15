// What a corpus directory holds, for every layer that walks it (`gate.mjs`,
// `tally.mjs`, `human.mjs`, `images.mjs`). One spelling of "a record is a
// `<slug>/recipe.json`" and one spelling of the typo guard, because a run that
// quietly shrinks to nothing is a run that reports a pass it never made. The
// pipeline CLIs' shared odds and ends live here too.
//
// Node built-ins only, on purpose: `tally.mjs` imports this inside the
// production container, where the pipeline's dev dependencies do not exist.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `<recordsDir>/<slug>/recipe.json` in slug order, or just the named
 * slugs. A named slug with no record throws: a typo must never quietly shrink
 * a gate run into a pass.
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

/** Every record `recordSlugs` names, read: `{ slug, file, recipe }`. */
export function readRecords(recordsDir, slugs = []) {
  return recordSlugs(recordsDir, slugs).map((slug) => {
    const file = join(recordsDir, slug, 'recipe.json');
    return { slug, file, recipe: JSON.parse(readFileSync(file, 'utf8')) };
  });
}

/** A credential a pipeline CLI reads from the environment, or a named refusal. */
export const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — AGENTS.md says where the credential lives`);
  return value;
};

/** A literal, escaped for use inside a RegExp. */
export const escapeRe = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The Owned Recipe Store (#331, ADR 0011): the corpus of Recipes Dinder
// authored, committed to the repository as reviewed data assets, shipped with
// the deploy and read in memory — no network hop, no schema, no migrations.
// Blended into every Cook Deck at deal time (#316); the Redis pool stays
// purely Sourced, so nothing here ever writes anywhere.
//
// An Owned Recipe is a `PooledRecipe` with the corpus's own guarantees on top:
// a frozen `owned:<slug>` identity authored with the record, mandatory
// servings, one meal type, at most one cuisine, declared diets — and no
// `aggregateLikes` and no source credit, because there is no source. The
// schema is the structural gate: `.strict()` is what keeps a backfilled
// `aggregateLikes` from ever landing in a record.
import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { CUISINES, DIETS, MEAL_TYPES, type Craving, type Diet } from '@dinder/shared/types';

const ownedRecipeSchema = z
  .object({
    kind: z.literal('recipe'),
    /** Authored with the record and never re-derived from the title: an Owned
     *  Recipe never ages out, so a slug regenerated from a retitled dish would
     *  break Shopping Lists minted months earlier (ADR 0011). */
    placeId: z.string().regex(/^owned:[a-z0-9-]+$/),
    name: z.string().min(1),
    /** Stamped by the image pipeline; absent until that Recipe's photo is up. */
    photoUrl: z.string().optional(),
    /** Mandatory: it is the denominator of the scale to the Headcount. */
    servings: z.number().int().positive(),
    mealType: z.enum(MEAL_TYPES),
    cuisine: z.enum(CUISINES).optional(),
    diets: z.array(z.enum(DIETS)),
    ingredients: z
      .array(
        z.object({
          name: z.string().min(1),
          amount: z.number(),
          unit: z.string(),
          original: z.string().min(1),
        })
      )
      .min(1),
    steps: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type OwnedRecipe = z.infer<typeof ownedRecipeSchema>;

/**
 * `vegan ⊆ vegetarian ⊆ pescetarian`, encoded once and only here: a record
 * declares the strictest diet it satisfies and answers every looser chip that
 * implies. Every other diet — gluten free, ketogenic, paleo — implies nothing.
 */
const IMPLIED: Partial<Record<Diet, readonly Diet[]>> = {
  vegan: ['vegetarian', 'pescetarian'],
  vegetarian: ['pescetarian'],
};

const satisfies = (diets: readonly Diet[]): Set<Diet> =>
  new Set(diets.flatMap((diet) => [diet, ...(IMPLIED[diet] ?? [])]));

export interface OwnedRecipeStore {
  /**
   * Every Owned Recipe that answers this Craving: the meal type exactly, one
   * of the craved cuisines (any, when no chip names one), and every craved
   * diet satisfied. In memory and synchronous — there is nothing to await.
   */
  forCraving(craving: Craving): OwnedRecipe[];
}

export function createOwnedRecipeStore(recipes: readonly OwnedRecipe[]): OwnedRecipeStore {
  const indexed = recipes.map((recipe) => ({ recipe, diets: satisfies(recipe.diets) }));
  return {
    forCraving(craving) {
      return indexed
        .filter(
          ({ recipe, diets }) =>
            recipe.mealType === craving.mealType &&
            // An untagged Recipe is not "every cuisine": the chips mean
            // tagged-as, so it answers only a Craving that names none.
            (craving.cuisines.length === 0 ||
              (recipe.cuisine !== undefined && craving.cuisines.includes(recipe.cuisine))) &&
            craving.diets.every((diet) => diets.has(diet))
        )
        .map(({ recipe }) => recipe);
    },
  };
}

/**
 * The corpus on disk: `backend/recipes/<frozen-slug>/recipe.json`, the same
 * layout `scripts/corpus/images.mjs` reads and stamps `photoUrl` into. One
 * level under the package root from `src/` and from `dist/` alike, so the
 * built server and `tsx` find the same directory.
 */
const CORPUS_DIR = new URL('../../recipes/', import.meta.url);

/**
 * Read at boot, once. A record that will not parse throws by name rather than
 * going quietly missing from every Deck — this is reviewed data shipped with
 * the deploy, so a bad batch should fail loudly and be one revert from gone.
 */
export function loadOwnedCorpus(dir: URL = CORPUS_DIR): OwnedRecipe[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = `${entry.name}/recipe.json`;
      const parsed = ownedRecipeSchema.safeParse(
        JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
      );
      if (!parsed.success) throw new Error(`${file}: ${parsed.error.message}`);
      // The directory is the frozen slug, so the image the record points at and
      // the folder it lives in can never drift apart.
      if (parsed.data.placeId !== `owned:${entry.name}`) {
        throw new Error(`${file}: placeId ${parsed.data.placeId} is not owned:${entry.name}`);
      }
      return parsed.data;
    });
}

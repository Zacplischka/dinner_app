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
// schema is the last structural gate: `.strict()` is what keeps a backfilled
// `aggregateLikes` from ever landing in a record. The corpus pipeline's own
// structural layer (`scripts/corpus/gate.mjs`, #336) checks the same shape
// before a record is ever committed — change one and change the other.
import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { CUISINES, DIETS, MEAL_TYPES, type Craving, type Diet } from '@dinder/shared/types';
import { config } from '../config/index.js';

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
          /** The matchable Woolworths term, when `name` has to stay
           *  cook-honest to clear the corpus's culinary gate: "gluten free
           *  vegetable stock" reads right on the card and searches like
           *  nothing, so the Product Match gets "vegetable stock" here. */
          searchTerm: z.string().min(1).optional(),
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
  /**
   * The whole Recipe behind an `owned:` card, whatever Craving dealt it — what
   * the Shopping List is minted from (#262, #332). The corpus is the only copy: an
   * Owned Recipe is never written to the Redis pool, so it can never be read
   * back out of one, and unlike a Sourced Recipe it never ages out.
   */
  byPlaceId(placeId: string): OwnedRecipe | undefined;
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
    // ponytail: a scan, not an index — one lookup per Shopping List over a
    // corpus in the thousands. Upgrade path if a hot path ever calls it per
    // card: build a Map beside `indexed`.
    byPlaceId: (placeId) => recipes.find((recipe) => recipe.placeId === placeId),
  };
}

/**
 * Read at boot, once, from `config.ownedRecipesDir` — `<dir>/<frozen-slug>/
 * recipe.json`, the same layout `scripts/corpus/images.mjs` reads and stamps
 * `photoUrl` into. A record that will not parse throws by name rather than
 * going quietly missing from every Deck — this is reviewed data shipped with
 * the deploy, so a bad batch should fail loudly and be one revert from gone.
 */
export function loadOwnedCorpus(dir: URL = config.ownedRecipesDir): OwnedRecipe[] {
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

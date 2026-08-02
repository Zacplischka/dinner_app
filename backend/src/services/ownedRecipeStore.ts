// Prototype (#316, for #319): the owned recipe corpus, loaded once at startup
// from docs/prototypes/corpus-pipeline/records and dealt in union with the
// vendor pool. Throwaway pilot code — in-memory, no Redis, never expires.
import fs from 'node:fs';
import path from 'node:path';
import type { Craving } from '@dinder/shared/types';
import { logger } from '../logger.js';
import type { PooledRecipe } from './spoonacularClient.js';

export const OWNED_PREFIX = 'owned:';

const RECORDS_DIR = 'docs/prototypes/corpus-pipeline/records';

/** One record's recipe.json, as the corpus pipeline writes it. */
interface OwnedRecord {
  placeId?: string;
  title?: string;
  servings?: number;
  mealType?: string;
  cuisine?: string | null;
  diets?: string[];
  extendedIngredients?: Array<{
    name: string;
    amount?: number;
    unit?: string;
    original?: string;
    searchTerm?: string;
  }>;
  steps?: string[];
}

/**
 * A PooledRecipe plus the craving facets the deal filters on. The ingredient
 * objects carry the record's `searchTerm` through as an extra optional field —
 * still assignable wherever PooledIngredient[] is expected.
 */
export interface OwnedRecipe extends PooledRecipe {
  ingredients: Array<PooledRecipe['ingredients'][number] & { searchTerm?: string }>;
  mealType: string;
  cuisine: string | null;
  diets: string[];
}

/** ponytail: walk up from cwd to find the repo root — dev runs from backend/,
 * tests from elsewhere; missing dir (e.g. production image) = empty corpus. */
function findRecordsDir(): string | null {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, RECORDS_DIR);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const recordsDir = findRecordsDir();

/** Where the corpus's dish images live — the /owned-images static mount. */
export const ownedImagesDir = recordsDir ? path.join(path.dirname(recordsDir), 'images') : null;

function loadOwnedRecipes(): OwnedRecipe[] {
  if (!recordsDir) return [];
  const recipes: OwnedRecipe[] = [];
  for (const slug of fs.readdirSync(recordsDir)) {
    const file = path.join(recordsDir, slug, 'recipe.json');
    if (!fs.existsSync(file)) continue; // record still in the pipeline
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8')) as OwnedRecord;
      if (!record.title) continue;
      recipes.push({
        kind: 'recipe',
        placeId: record.placeId ?? `${OWNED_PREFIX}${slug}`,
        name: record.title,
        photoUrl: `/owned-images/${slug}.webp`,
        // aggregateLikes deliberately absent: this source knows nothing about
        // likes, same as a vendor recipe without them (readers apply ?? -1).
        servings: record.servings,
        ingredients: (record.extendedIngredients ?? []).map((ingredient) => ({
          name: ingredient.name,
          amount: ingredient.amount ?? 0,
          unit: ingredient.unit ?? '',
          original: ingredient.original ?? ingredient.name,
          searchTerm: ingredient.searchTerm,
        })),
        steps: record.steps ?? [],
        mealType: record.mealType ?? '',
        cuisine: record.cuisine ?? null,
        diets: record.diets ?? [],
      });
    } catch (error) {
      logger.warn({ file, error }, 'Owned recipe record failed to load');
    }
  }
  logger.info({ count: recipes.length }, 'Owned recipe corpus loaded');
  return recipes;
}

const ownedRecipes = loadOwnedRecipes();

// The diet strictness ladder: vegan ⊆ vegetarian ⊆ pescetarian — a stricter
// declared diet satisfies a looser craved one.
const ALSO_SATISFIES: Record<string, string[]> = {
  vegetarian: ['vegan'],
  pescetarian: ['vegan', 'vegetarian'],
};

const dietSatisfied = (declared: string[], craved: string): boolean =>
  declared.includes(craved) || (ALSO_SATISFIES[craved] ?? []).some((d) => declared.includes(d));

/**
 * The owned recipes matching a Craving: mealType exact; a null cuisine matches
 * any craved cuisine while a declared one must be craved (or nothing craved);
 * every craved diet must be satisfied, ladder applied.
 */
export function filterByCraving(craving: Craving): OwnedRecipe[] {
  return ownedRecipes.filter(
    (recipe) =>
      recipe.mealType === craving.mealType &&
      (recipe.cuisine === null ||
        craving.cuisines.length === 0 ||
        (craving.cuisines as readonly string[]).includes(recipe.cuisine)) &&
      craving.diets.every((diet) => dietSatisfied(recipe.diets, diet))
  );
}

/** The whole owned Recipe behind a dealt card. Never expires. */
export function readOwnedRecipe(placeId: string): OwnedRecipe | null {
  return ownedRecipes.find((recipe) => recipe.placeId === placeId) ?? null;
}

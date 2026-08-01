// The Cook Branch's setup vocabulary (#259): the Craving a Session's Recipe
// Deck is dealt from, and the Headcount its Top Pick is later scaled to.
// See CONTEXT.md — a Craving is the canonical (meal type, cuisine set, diet
// set) triple, and Headcount is deliberately not part of it.
//
// The three chip vocabularies are Spoonacular's own `type`, `cuisine`, and
// `diet` values, narrowed to what a dinner setup screen should offer. They
// live here because the setup screen renders them and the create endpoint
// validates against them (ADR 0006) — one list, one spelling, both sides.

/** Spoonacular `type` values worth offering for a dinner decision. */
export const MEAL_TYPES = [
  'main course',
  'side dish',
  'salad',
  'soup',
  'breakfast',
  'snack',
  'dessert',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Spoonacular `cuisine` values. */
export const CUISINES = [
  'american',
  'chinese',
  'french',
  'greek',
  'indian',
  'italian',
  'japanese',
  'korean',
  'mediterranean',
  'mexican',
  'middle eastern',
  'spanish',
  'thai',
  'vietnamese',
] as const;
export type Cuisine = (typeof CUISINES)[number];

/**
 * Spoonacular `diet` values. A preference filter on the Deck, explicitly not
 * an allergy-safety guarantee — the setup screen must say so (#253 story 9).
 */
export const DIETS = [
  'vegetarian',
  'vegan',
  'pescetarian',
  'gluten free',
  'ketogenic',
  'paleo',
] as const;
export type Diet = (typeof DIETS)[number];

/** The largest Headcount the stepper offers, and the create contract accepts. */
export const MAX_HEADCOUNT = 12;

/**
 * The canonical triple a Cook Session's Deck is dealt from. Two Sessions with
 * the same Craving draw from the same shared recipe pool, so the sets are
 * order-insensitive: the pool key canonicalizes them (backend).
 */
export interface Craving {
  mealType: MealType;
  cuisines: Cuisine[];
  diets: Diet[];
}

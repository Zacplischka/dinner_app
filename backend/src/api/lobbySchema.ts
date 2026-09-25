import { z } from 'zod';
import {
  CUISINES,
  DIETS,
  MEAL_TYPES,
  GENRES,
  DECADES,
  MEDIA_TYPES,
  MAX_HEADCOUNT,
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  MIN_SEARCH_RADIUS_MILES,
  MAX_SEARCH_RADIUS_MILES,
  SESSION_CODE_PATTERN,
} from '@dinder/shared/types';

// The Craving as a request shape (#259): the create endpoint nests it.
//
// The chips are closed vocabularies, not free text: they reach a Spoonacular
// query and a shared Redis pool key, so only the values the setup screen offers
// get through, and the caps stop a repeated chip building an unbounded pool key
// with an unbounded corpus scan behind it.
//
// It lives here rather than beside the `Craving` type because `@dinder/shared`
// carries no runtime dependencies — it ships to the browser.
export const cravingSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length),
  diets: z.array(z.enum(DIETS)).max(DIETS.length),
});

export const moodSchema = z.object({
  genres: z.array(z.enum(GENRES)).max(GENRES.length),
  decades: z.array(z.enum(DECADES)).max(DECADES.length),
  mediaTypes: z.array(z.enum(MEDIA_TYPES)).max(MEDIA_TYPES.length).optional(),
});
export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(250).optional(),
});
export const lobbyPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  revision: z.number().int().nonnegative(),
});
export const choicesPayloadSchema = lobbyPayloadSchema.extend({
  mood: moodSchema.optional(),
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length).optional(),
  diets: z.array(z.enum(DIETS)).max(DIETS.length).optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  headcount: z.number().int().min(1).max(MAX_HEADCOUNT).optional(),
  deckSize: z.number().int().min(MIN_DECK_SIZE).max(MAX_DECK_SIZE).optional(),
  location: locationSchema.optional(),
  searchRadiusMiles: z
    .number()
    .min(MIN_SEARCH_RADIUS_MILES)
    .max(MAX_SEARCH_RADIUS_MILES)
    .optional(),
});

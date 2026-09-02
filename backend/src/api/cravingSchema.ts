// The Craving as a request shape — one schema, both routers (#259, #334): the
// create endpoint nests it, the Nearest Craving read pipes its query into it.
//
// The chips are closed vocabularies, not free text: they reach a Spoonacular
// query and a shared Redis pool key, so only the values the setup screen offers
// get through, and the caps stop a repeated chip building an unbounded pool key
// with an unbounded corpus scan behind it.
//
// It lives here rather than beside the `Craving` type because `@dinder/shared`
// carries no runtime dependencies — it ships to the browser — and both callers
// are Express routers.

import { z } from 'zod';
import { CUISINES, DIETS, MEAL_TYPES } from '@dinder/shared/types';

export const cravingSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length),
  diets: z.array(z.enum(DIETS)).max(DIETS.length),
});

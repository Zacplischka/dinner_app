// The Craving router — one read, asked only after a Craving has already dealt
// nothing (#334): what is the nearest Craving that would deal, and how much
// does it hold? A GET because it is a question, not an act: relaxation is an
// offer, and minting the offered Craving is the create endpoint's job as it
// always was.
//
// It costs nothing to ask — the corpus is in memory and only already-warm
// pools are read — so it needs no rate window of its own.

import { Router } from 'express';
import { z } from 'zod';
import { CUISINES, DIETS, MEAL_TYPES, type NearestCravingResponse } from '@dinder/shared/types';
import { asyncHandler } from './asyncHandler.js';
import { DomainError } from '../services/DomainError.js';
import type { RecipePoolService } from '../services/RecipePoolService.js';

export function createCravingsRouter(recipePool: RecipePoolService) {
  const router = Router();

  /** An absent chip set is no chips, not a bad request. */
  const chips = z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(',') : []));

  // The same closed vocabularies the create endpoint validates against: these
  // values reach a shared pool key, so only what the setup screen offers gets
  // through.
  const cravingQuerySchema = z.object({
    mealType: z.enum(MEAL_TYPES),
    cuisines: chips.pipe(z.array(z.enum(CUISINES))),
    diets: chips.pipe(z.array(z.enum(DIETS))),
  });

  /**
   * GET /api/cravings/nearest?mealType=&cuisines=&diets=
   * The Nearest Craving to one that dealt nothing — or `{ nearest: null }`
   * when even the widest step is empty and the refusal stands.
   */
  router.get(
    '/nearest',
    asyncHandler(async (req, res) => {
      const validation = cravingQuerySchema.safeParse(req.query);

      if (!validation.success) {
        req.log.warn({ reason: 'validation_error' }, 'Rejected nearest Craving read');
        throw new DomainError(
          'VALIDATION_ERROR',
          'mealType, cuisines and diets must be setup chips'
        );
      }

      const nearest = await recipePool.nearestCraving(validation.data);
      return res.json({ nearest } satisfies NearestCravingResponse);
    })
  );

  return router;
}

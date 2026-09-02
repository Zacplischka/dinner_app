// The Craving router — one read, asked only after a Craving has already dealt
// nothing (#334): what is the nearest Craving that would deal, and how much
// does it hold? A GET because it is a question, not an act: relaxation is an
// offer, and minting the offered Craving is the create endpoint's job as it
// always was.
//
// It costs nothing to ask — the corpus is in memory and only already-warm
// pools are read — so it needs no rate window of its own.

import { Router } from 'express';
import type { NearestCravingResponse } from '@dinder/shared/types';
import { asyncHandler } from './asyncHandler.js';
import { cravingSchema } from './cravingSchema.js';
import { DomainError } from '../services/DomainError.js';
import type { RecipePoolService } from '../services/RecipePoolService.js';

/** An absent chip set is no chips, not a bad request. */
const chips = (raw: unknown) => (typeof raw === 'string' && raw ? raw.split(',') : []);

export function createCravingsRouter(recipePool: RecipePoolService) {
  const router = Router();

  /**
   * GET /api/cravings/nearest?mealType=&cuisines=&diets=
   * The Nearest Craving to one that dealt nothing — or `{ nearest: null }`
   * when even the widest step is empty and the refusal stands.
   */
  router.get(
    '/nearest',
    asyncHandler(async (req, res) => {
      // The query is the create endpoint's Craving, comma-encoded: split the
      // chip sets back into arrays and the one schema validates both paths.
      const validation = cravingSchema.safeParse({
        mealType: req.query.mealType,
        cuisines: chips(req.query.cuisines),
        diets: chips(req.query.diets),
      });

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

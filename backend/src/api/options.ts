// REST API endpoint for dinner options
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';
import type { SessionStore } from '../store/sessionStore.js';
import {
  SESSION_CODE_PATTERN,
  type ApiError,
  type LoadRestaurantsResponse,
} from '@dinder/shared/types';

export function createOptionsRouter(store: SessionStore) {
  const router = Router();

  /**
   * GET /api/options/:sessionCode
   * Get restaurants for a specific session
   */
  router.get(
    '/:sessionCode',
    asyncHandler(async (req, res) => {
      const { sessionCode } = req.params;

      if (!SESSION_CODE_PATTERN.test(sessionCode)) {
        req.log.warn(
          {
            sessionCode,
            reason: 'invalid_session_code',
          },
          'Rejected REST options get'
        );

        return res.status(404).json({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        } satisfies ApiError);
      }

      // Check if session exists
      if (!(await store.sessionExists(sessionCode))) {
        req.log.warn(
          {
            sessionCode,
            reason: 'session_not_found',
          },
          'Rejected REST options get'
        );

        return res.status(404).json({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        } satisfies ApiError);
      }

      const { restaurants, missingCount } = await store.getRestaurants(sessionCode);

      if (restaurants.length === 0) {
        req.log.warn(
          {
            sessionCode,
            reason: missingCount === 0 ? 'restaurant_ids_missing' : 'restaurant_data_missing',
            ...(missingCount > 0 && {
              requestedRestaurantCount: missingCount,
              missingRestaurantDataCount: missingCount,
            }),
          },
          'Rejected REST options get'
        );

        return res.status(404).json({
          code: 'NO_RESTAURANTS',
          message: 'No restaurants found for this session',
        } satisfies ApiError);
      }

      req.log.info(
        {
          sessionCode,
          restaurantCount: restaurants.length,
          missingRestaurantDataCount: missingCount,
        },
        'Returned REST session options'
      );

      return res.status(200).json({
        restaurants,
        sessionCode,
      } satisfies LoadRestaurantsResponse);
    })
  );

  return router;
}

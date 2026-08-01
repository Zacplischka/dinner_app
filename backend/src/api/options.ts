// REST API endpoint for dinner options
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';
import { DomainError } from '../services/DomainError.js';
import type { SessionStore } from '../store/sessionStore.js';
import { SESSION_CODE_PATTERN, type LoadRestaurantsResponse } from '@dinder/shared/types';

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

        throw new DomainError('SESSION_NOT_FOUND', 'Session not found');
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

        throw new DomainError('SESSION_NOT_FOUND', 'Session not found');
      }

      const { entries: restaurants, missingCount } = await store.getDeck(sessionCode);

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

        throw new DomainError('NO_RESTAURANTS', 'No restaurants found for this session');
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

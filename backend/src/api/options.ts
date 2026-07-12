// REST API endpoint for dinner options
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';
import { sessionStore as store } from '../store/sessionStore.js';

const router = Router();

/**
 * GET /api/options/:sessionCode
 * Get restaurants for a specific session
 */
router.get('/:sessionCode', asyncHandler(async (req, res) => {
  try {
    const { sessionCode } = req.params;

    // Validate session code format (6 uppercase alphanumeric)
    if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
      req.log.warn({
        sessionCode,
        reason: 'invalid_session_code',
      }, 'Rejected REST options get');

      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    // Check if session exists
    if (!(await store.sessionExists(sessionCode))) {
      req.log.warn({
        sessionCode,
        reason: 'session_not_found',
      }, 'Rejected REST options get');

      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    const { restaurants, missingCount } = await store.getRestaurants(sessionCode);

    if (restaurants.length === 0) {
      req.log.warn({
        sessionCode,
        reason: missingCount === 0 ? 'restaurant_ids_missing' : 'restaurant_data_missing',
        ...(missingCount > 0 && {
          requestedRestaurantCount: missingCount,
          missingRestaurantDataCount: missingCount,
        }),
      }, 'Rejected REST options get');

      return res.status(404).json({
        error: 'Not Found',
        code: 'NO_RESTAURANTS',
        message: 'No restaurants found for this session',
      });
    }

    req.log.info({
      sessionCode,
      restaurantCount: restaurants.length,
      missingRestaurantDataCount: missingCount,
    }, 'Returned REST session options');

    return res.status(200).json({
      restaurants,
      sessionCode,
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error getting restaurants');
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
}));

export default router;

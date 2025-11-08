// REST API endpoint for dinner options
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router, Request, Response } from 'express';
import { redis } from '../redis/client.js';
import type { Restaurant } from '@dinner-app/shared/types';

const router = Router();

/**
 * GET /api/options/:sessionCode
 * Get restaurants for a specific session
 */
router.get('/:sessionCode', async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;

    // Validate session code format (6 uppercase alphanumeric)
    if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    // Check if session exists
    const sessionExists = await redis.exists(`session:${sessionCode}`);
    if (!sessionExists) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    // Get restaurant IDs from Set
    const placeIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);

    if (placeIds.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'NO_RESTAURANTS',
        message: 'No restaurants found for this session',
      });
    }

    // Get full restaurant data from Hash
    const restaurants: Restaurant[] = [];
    for (const placeId of placeIds) {
      const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
      if (restaurantData) {
        restaurants.push(JSON.parse(restaurantData));
      }
    }

    if (restaurants.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'NO_RESTAURANTS',
        message: 'No restaurants found for this session',
      });
    }

    return res.status(200).json({
      restaurants,
      sessionCode,
    });
  } catch (error) {
    console.error('Error getting restaurants:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

export default router;
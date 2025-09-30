// REST API endpoint for dinner options
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router, Request, Response } from 'express';
import { DINNER_OPTIONS } from '../constants/dinnerOptions.js';

const router = Router();

/**
 * GET /api/options
 * Get the static list of dinner options
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    return res.status(200).json({
      options: DINNER_OPTIONS,
    });
  } catch (error) {
    console.error('Error getting options:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

export default router;
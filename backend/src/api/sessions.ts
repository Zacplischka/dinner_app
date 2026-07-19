// REST API endpoints for session management
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from './asyncHandler.js';
import { toApiError } from './toApiError.js';
import type { SessionService } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import {
  SESSION_CODE_PATTERN,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionResponse,
} from '@dinder/shared/types';

export function createSessionsRouter(sessionService: SessionService) {
  const router = Router();

  // Zod schemas for validation
  const createSessionRequestSchema = z.object({
    hostName: z.string().min(1).max(50),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string().optional(),
      })
      .optional(),
    searchRadiusMiles: z.number().min(1).max(15).optional(),
  });

  function validationFields(error: z.ZodError): string[] {
    return Object.keys(error.flatten().fieldErrors).sort();
  }

  /**
   * POST /api/sessions
   * Create a new dinner decision session
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let createContext: {
        hasLocation: boolean;
        searchRadiusMiles: number | null;
      } = {
        hasLocation: false,
        searchRadiusMiles: null,
      };

      try {
        // Validate request body
        const validation = createSessionRequestSchema.safeParse(req.body);

        if (!validation.success) {
          req.log.warn(
            {
              reason: 'validation_error',
              fields: validationFields(validation.error),
            },
            'Rejected REST session create'
          );

          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'hostName is required and must be 1-50 characters',
          });
        }

        const { hostName, location, searchRadiusMiles }: CreateSessionRequest = validation.data;

        // Default searchRadiusMiles to 5 if location is provided but radius is not
        const radius = location && searchRadiusMiles === undefined ? 5 : searchRadiusMiles;
        createContext = {
          hasLocation: Boolean(location),
          searchRadiusMiles: radius ?? null,
        };

        // Create session
        const session = await sessionService.createSession(hostName, location, radius);

        req.log.info(
          {
            sessionCode: session.sessionCode,
            ...createContext,
            restaurantCount: session.restaurantCount ?? 0,
          },
          'Created REST session'
        );

        return res.status(201).json(session satisfies CreateSessionResponse);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'NO_RESTAURANTS_FOUND') {
          req.log.warn(
            {
              reason: 'no_restaurants_found',
              ...createContext,
            },
            'Rejected REST session create'
          );
        } else {
          req.log.error({ err: error }, 'Error creating session');
        }

        const { status, body } = toApiError(error);
        return res.status(status).json(body);
      }
    })
  );

  /**
   * GET /api/sessions/:sessionCode
   * Get session details
   */
  router.get(
    '/:sessionCode',
    asyncHandler(async (req, res) => {
      const { sessionCode } = req.params;

      // Validate session code format
      if (!SESSION_CODE_PATTERN.test(sessionCode)) {
        req.log.warn(
          {
            sessionCode,
            reason: 'invalid_session_code',
          },
          'Rejected REST session get'
        );

        return res.status(404).json({
          code: 'SESSION_NOT_FOUND',
          message: `Session ${sessionCode} not found or has expired`,
        });
      }

      // Get session
      const session = await sessionService.getSession(sessionCode);

      if (!session) {
        req.log.warn(
          {
            sessionCode,
            reason: 'session_not_found',
          },
          'Rejected REST session get'
        );

        return res.status(404).json({
          code: 'SESSION_NOT_FOUND',
          message: `Session ${sessionCode} not found or has expired`,
        });
      }

      req.log.info(
        {
          sessionCode,
          state: session.state,
          participantCount: session.participantCount,
        },
        'Returned REST session'
      );

      return res.status(200).json(session satisfies SessionResponse);
    })
  );

  return router;
}

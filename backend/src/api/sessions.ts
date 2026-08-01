// REST API endpoints for session management
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from './asyncHandler.js';
import type { SessionService } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import {
  BRANCHES,
  CUISINES,
  DIETS,
  MAX_HEADCOUNT,
  MEAL_TYPES,
  SESSION_CODE_PATTERN,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionResponse,
} from '@dinder/shared/types';

export function createSessionsRouter(sessionService: SessionService) {
  const router = Router();

  // Zod schemas for validation
  const createSessionRequestSchema = z
    .object({
      hostName: z.string().min(1).max(50),
      location: z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          address: z.string().optional(),
        })
        .optional(),
      searchRadiusMiles: z.number().min(1).max(15).optional(),
      branch: z.enum(BRANCHES).optional(),
      // The chips are closed vocabularies, not free text: they reach a
      // Spoonacular query and a shared Redis pool key, so only the values the
      // setup screen offers get through.
      craving: z
        .object({
          mealType: z.enum(MEAL_TYPES),
          cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length),
          diets: z.array(z.enum(DIETS)).max(DIETS.length),
        })
        .optional(),
      headcount: z.number().int().min(1).max(MAX_HEADCOUNT).optional(),
    })
    // A Cook Session has nothing to deal without its setup. Only the Cook
    // Branch requires it, so every existing client stays valid (ADR 0007).
    .superRefine((body, ctx) => {
      if (body.branch !== 'cook') return;
      if (!body.craving) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['craving'], message: 'required' });
      }
      if (body.headcount === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['headcount'], message: 'required' });
      }
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

        throw new DomainError(
          'VALIDATION_ERROR',
          'hostName is required and must be 1-50 characters'
        );
      }

      const { hostName, location, searchRadiusMiles, branch, craving, headcount } =
        validation.data as CreateSessionRequest;

      // Default searchRadiusMiles to 5 if location is provided but radius is not
      const radius = location && searchRadiusMiles === undefined ? 5 : searchRadiusMiles;
      // Cook setup only applies to a Cook Session; superRefine has already
      // established both halves are present when the Branch is Cook.
      const cook =
        branch === 'cook' && craving && headcount !== undefined
          ? { craving, headcount }
          : undefined;
      const createContext = {
        hasLocation: Boolean(location),
        searchRadiusMiles: radius ?? null,
      };

      // The expected empty-area outcome is logged with the search context that
      // explains it; every other failure is the global handler's to log.
      const session = await sessionService
        .createSession(hostName, location, radius, branch, cook)
        .catch((error: unknown) => {
          if (error instanceof DomainError && error.code === 'NO_RESTAURANTS_FOUND') {
            req.log.warn(
              { reason: 'no_restaurants_found', ...createContext },
              'Rejected REST session create'
            );
          }
          throw error;
        });

      req.log.info(
        {
          sessionCode: session.sessionCode,
          ...createContext,
          restaurantCount: session.restaurantCount ?? 0,
        },
        'Created REST session'
      );

      return res.status(201).json(session satisfies CreateSessionResponse);
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

      const notFound = () =>
        new DomainError('SESSION_NOT_FOUND', `Session ${sessionCode} not found or has expired`);

      // Validate session code format
      if (!SESSION_CODE_PATTERN.test(sessionCode)) {
        req.log.warn(
          {
            sessionCode,
            reason: 'invalid_session_code',
          },
          'Rejected REST session get'
        );

        throw notFound();
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

        throw notFound();
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

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from './asyncHandler.js';
import { choicesPayloadSchema, cravingSchema, locationSchema, moodSchema } from './lobbySchema.js';
import type { SessionService } from '../services/SessionService.js';
import { DomainError } from '../services/DomainError.js';
import { rateLimit } from './rateWindow.js';
import {
  BRANCHES,
  MAX_DISPLAY_NAME_LENGTH,
  SESSION_CODE_PATTERN,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionResponse,
} from '@dinder/shared/types';

// Every located create spends a Google-billed Places search; cap per-visitor
// spend like /geocode does. A table of 4 makes one Session, so 20 a minute
// leaves room for retries and a shared NAT while matching the geocode window
// a Host clears first.
const CREATE_LIMIT = 20;

export function createSessionsRouter(sessionService: SessionService) {
  const router = Router();
  // ponytail: per-instance in-memory rate window, same ceiling as rateWindow.ts notes.
  const createLimit = rateLimit({
    limit: CREATE_LIMIT,
    windowMs: 60_000,
    message: 'Too many Sessions created. Please try again shortly.',
  });

  const createSessionRequestSchema = z
    .object({
      hostName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH),
      collaborative: z.boolean().optional(),
      location: locationSchema.optional(),
      branch: z.enum(BRANCHES).optional(),
      craving: cravingSchema.optional(),
      mood: moodSchema.optional(),
    })
    // A deckSize outside the range is rejected, never clamped (#415): it is a
    // client bug, and silently dealing a different Deck would hide it.
    .merge(choicesPayloadSchema.pick({ headcount: true, deckSize: true, searchRadiusMiles: true }))
    // A Cook or Watch Session has nothing to deal without its setup.
    .superRefine((body, ctx) => {
      const required = (field: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'required' });
      if (body.collaborative) {
        if (!body.branch) required('branch');
        return;
      }
      if (body.branch === 'cook') {
        if (!body.craving) required('craving');
        if (body.headcount === undefined) required('headcount');
      }
      if (body.branch === 'watch' && !body.mood) required('mood');
    });

  function validationFields(error: z.ZodError): string[] {
    return Object.keys(error.flatten().fieldErrors).sort();
  }

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const validation = createSessionRequestSchema.safeParse(req.body);

      if (!validation.success) {
        req.log.warn(
          { reason: 'validation_error', fields: validationFields(validation.error) },
          'Rejected REST session create'
        );

        throw new DomainError(
          'VALIDATION_ERROR',
          `hostName is required and must be 1-${MAX_DISPLAY_NAME_LENGTH} characters`
        );
      }

      createLimit(req, res);

      // Annotated, not cast: this is what checks the Zod schema still agrees
      // with the shared contract, so a chip vocabulary drifting out of
      // shared/types/cook.ts fails the build instead of the request.
      const {
        hostName,
        collaborative,
        location,
        searchRadiusMiles,
        branch,
        craving,
        headcount,
        mood,
        deckSize,
      }: CreateSessionRequest = validation.data;

      const radius = location && searchRadiusMiles === undefined ? 5 : searchRadiusMiles;
      // Cook setup only applies to a Cook Session; superRefine has already
      // established both halves are present when the Branch is Cook.
      const cook =
        branch === 'cook' && craving && headcount !== undefined
          ? { craving, headcount }
          : undefined;
      const watch = branch === 'watch' && mood ? { mood } : undefined;
      const createContext = {
        hasLocation: Boolean(location),
        searchRadiusMiles: radius ?? null,
      };

      // The expected empty outcomes — an empty area, and its Cook and Watch
      // counterparts an empty Craving or Mood — are logged with the request
      // context that explains them; every other failure is the global
      // handler's to log.
      const expectedEmpty: Partial<Record<string, string>> = {
        NO_RESTAURANTS_FOUND: 'no_restaurants_found',
        NO_RECIPES_FOUND: 'no_recipes_found',
        NO_MOVIES_FOUND: 'no_movies_found',
      };
      const session = await sessionService
        .createSession(hostName, {
          collaborative,
          location,
          searchRadiusMiles: radius,
          branch,
          cook,
          watch,
          deckSize,
        })
        .catch((error: unknown) => {
          const reason = error instanceof DomainError ? expectedEmpty[error.code] : undefined;
          if (reason) {
            req.log.warn({ reason, ...createContext }, 'Rejected REST session create');
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

  router.get(
    '/:sessionCode',
    asyncHandler(async (req, res) => {
      const { sessionCode } = req.params;

      const notFound = () =>
        new DomainError('SESSION_NOT_FOUND', `Session ${sessionCode} not found or has expired`);

      if (!SESSION_CODE_PATTERN.test(sessionCode)) {
        req.log.warn({ sessionCode, reason: 'invalid_session_code' }, 'Rejected REST session get');

        throw notFound();
      }

      const session = await sessionService.getSession(sessionCode);

      if (!session) {
        req.log.warn({ sessionCode, reason: 'session_not_found' }, 'Rejected REST session get');

        throw notFound();
      }

      req.log.info(
        { sessionCode, state: session.state, participantCount: session.participantCount },
        'Returned REST session'
      );

      return res.status(200).json(session satisfies SessionResponse);
    })
  );

  return router;
}

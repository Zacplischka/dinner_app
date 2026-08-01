// Canonical public REST error transport (issue #104).
// Proves the single private→public mapping: every DomainErrorCode, plus
// malformed input and unexpected errors, produces exactly { code, message } with
// the mapped HTTP status — no legacy `error` field, no persistence detail.

import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { DomainError, type DomainErrorCode } from '../../src/services/DomainError.js';
import { logger } from '../../src/logger.js';

function appThrowing(err: unknown) {
  const app = express();
  app.use(express.json());
  app.post('/boom', (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

const GENERIC = 'An unexpected error occurred. Please try again later.';

describe('canonical error transport', () => {
  // Every private DomainErrorCode → its public { code, status }. `message` is
  // asserted only where the transport overrides the domain message.
  //
  // Keyed by DomainErrorCode — the same compiler-enforced-record pattern as the
  // mapper under test (toApiError.MAPPING). The mapper's exhaustive Record is
  // what let a plain-array version of this table fall five codes behind
  // silently: the table is the thing that can rot, not the mapping.
  const cases: Record<
    DomainErrorCode,
    { domainMessage: string; status: number; code: string; message?: string }
  > = {
    SESSION_NOT_FOUND: {
      domainMessage: 'Session AB123 not found',
      status: 404,
      code: 'SESSION_NOT_FOUND',
    },
    SESSION_FULL: { domainMessage: 'Session is full', status: 409, code: 'SESSION_FULL' },
    DISPLAY_NAME_TAKEN: {
      domainMessage: 'Display name taken',
      status: 409,
      code: 'DISPLAY_NAME_TAKEN',
    },
    SESSION_ALREADY_STARTED: {
      domainMessage: 'Session already started',
      status: 409,
      code: 'SESSION_ALREADY_STARTED',
    },
    NO_RESTAURANTS_FOUND: {
      domainMessage: 'No restaurants',
      status: 404,
      code: 'NO_RESTAURANTS_FOUND',
    },
    NO_RECIPES_FOUND: {
      domainMessage: 'No recipes matched that Craving',
      status: 404,
      code: 'NO_RECIPES_FOUND',
    },
    RECIPE_SOURCE_UNAVAILABLE: {
      domainMessage: 'Could not reach the recipe source. Please try again.',
      status: 503,
      code: 'RECIPE_SOURCE_UNAVAILABLE',
    },
    NO_RESTAURANTS: {
      domainMessage: 'This session has no restaurants',
      status: 404,
      code: 'NO_RESTAURANTS',
    },
    VALIDATION_ERROR: {
      domainMessage: 'Bad field',
      status: 400,
      code: 'VALIDATION_ERROR',
    },
    ALREADY_SUBMITTED: {
      domainMessage: 'Already submitted',
      status: 409,
      code: 'ALREADY_SUBMITTED',
    },
    INVALID_RESTAURANTS: {
      domainMessage: 'Bad restaurants',
      status: 400,
      code: 'VALIDATION_ERROR',
    },
    NOT_IN_SESSION: {
      domainMessage: 'Not a participant',
      status: 403,
      code: 'NOT_IN_SESSION',
    },
    // Expired and never-existed answer identically — the public code is the
    // plain NOT_FOUND, so the wire reveals nothing about which it was.
    SHOPPING_LIST_NOT_FOUND: {
      domainMessage: 'Shopping list not found',
      status: 404,
      code: 'NOT_FOUND',
    },
    RATE_LIMITED: {
      domainMessage: 'Places quota exhausted',
      status: 503,
      code: 'RATE_LIMITED',
    },
    not_found: {
      domainMessage: 'Friend request not found',
      status: 404,
      code: 'NOT_FOUND',
    },
    already_friends: {
      domainMessage: 'Already friends',
      status: 409,
      code: 'ALREADY_FRIENDS',
    },
    request_pending: { domainMessage: 'Pending', status: 409, code: 'REQUEST_PENDING' },
    // blocked hides behind the missing-user path: status AND message must match.
    blocked: {
      domainMessage: 'Unable to send friend request',
      status: 404,
      code: 'NOT_FOUND',
      message: 'User not found with that email',
    },
    // database_error must never leak its internal message.
    database_error: {
      domainMessage: 'Failed to fetch friend profiles',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
    },
    validation_error: {
      domainMessage: 'No valid ids',
      status: 400,
      code: 'VALIDATION_ERROR',
    },
  };

  it.each(
    (Object.keys(cases) as DomainErrorCode[]).map((domain) => ({ domain, ...cases[domain] }))
  )(
    'maps DomainError($domain) → $code $status as exactly { code, message }',
    async ({ domain, domainMessage, status, code, message }) => {
      // 500s log the real error; silence it so the suite output stays clean.
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);

      const response = await request(appThrowing(new DomainError(domain, domainMessage)))
        .post('/boom')
        .expect(status);

      expect(response.body).toEqual({ code, message: message ?? domainMessage });
      vi.restoreAllMocks();
    }
  );

  it('never leaks the blocked domain message (matches the missing-user path)', async () => {
    const response = await request(
      appThrowing(new DomainError('blocked', 'Unable to send friend request'))
    )
      .post('/boom')
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.message).toBe('User not found with that email');
    expect(JSON.stringify(response.body)).not.toContain('Unable to send friend request');
  });

  it('maps malformed JSON input to VALIDATION_ERROR 400', async () => {
    const app = express();
    app.use(express.json());
    app.post('/boom', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const response = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON',
    });
  });

  it('maps an unexpected error to a detail-free INTERNAL_ERROR 500', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const response = await request(appThrowing(new Error('secret db dsn leaked here')))
      .post('/boom')
      .expect(500);

    expect(response.body).toEqual({ code: 'INTERNAL_ERROR', message: GENERIC });
    expect(JSON.stringify(response.body)).not.toContain('secret db dsn');
    vi.restoreAllMocks();
  });
});

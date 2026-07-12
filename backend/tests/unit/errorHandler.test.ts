import { logger } from '../../src/logger.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { DomainError } from '../../src/services/DomainError.js';

function appThrowing(err: unknown) {
  const app = express();
  app.use(express.json());
  app.get('/boom', (_req, _res, next) => next(err));
  app.use(errorHandler);
  return app;
}

describe('global errorHandler middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps DomainError codes to HTTP statuses with the standard body shape', async () => {
    const response = await request(
      appThrowing(new DomainError('SESSION_NOT_FOUND', 'Session ABC123 not found'))
    )
      .get('/boom')
      .expect(404);

    expect(response.body).toEqual({
      error: 'SESSION_NOT_FOUND',
      code: 'SESSION_NOT_FOUND',
      message: 'Session ABC123 not found',
    });
  });

  it('defaults unmapped DomainError codes to 400', async () => {
    const response = await request(
      appThrowing(new DomainError('SOMETHING_ELSE', 'nope'))
    )
      .get('/boom')
      .expect(400);

    expect(response.body.code).toBe('SOMETHING_ELSE');
  });

  it('returns a generic 500 for unexpected errors and logs the stack', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const err = new Error('boom');

    const response = await request(appThrowing(err)).get('/boom').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(errorSpy).toHaveBeenCalledWith({ err: err }, 'Unhandled request error');
  });
});

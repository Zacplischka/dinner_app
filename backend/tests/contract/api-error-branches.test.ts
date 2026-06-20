import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';
import * as SessionService from '../../src/services/SessionService.js';

describe('REST API internal error branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/sessions should return INTERNAL_ERROR for unexpected create failures', async () => {
    vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(new Error('boom'));

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });

  it('GET /api/sessions/:sessionCode should return INTERNAL_ERROR for unexpected lookup failures', async () => {
    vi.spyOn(SessionService, 'getSession').mockRejectedValueOnce(new Error('boom'));

    const response = await request(app).get('/api/sessions/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });

  it('POST /api/sessions/:sessionCode/join should return INTERNAL_ERROR for unexpected join failures', async () => {
    vi.spyOn(SessionService, 'joinSession').mockRejectedValueOnce(new Error('boom'));

    const response = await request(app)
      .post('/api/sessions/ABC123/join')
      .send({ participantName: 'Bob' })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });

  it('GET /api/options/:sessionCode should return INTERNAL_ERROR for unexpected Redis failures', async () => {
    vi.spyOn(redis, 'exists').mockRejectedValueOnce(new Error('boom'));

    const response = await request(app).get('/api/options/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });
});

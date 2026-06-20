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
    const error = new Error('boom');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(error);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(errorSpy).toHaveBeenCalledWith('Error creating session:', error);
  });

  it('GET /api/sessions/:sessionCode should return INTERNAL_ERROR for unexpected lookup failures', async () => {
    const error = new Error('boom');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SessionService, 'getSession').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/sessions/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(errorSpy).toHaveBeenCalledWith('Error getting session:', error);
  });

  it('POST /api/sessions/:sessionCode/join should return INTERNAL_ERROR for unexpected join failures', async () => {
    const error = new Error('boom');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SessionService, 'joinSession').mockRejectedValueOnce(error);

    const response = await request(app)
      .post('/api/sessions/ABC123/join')
      .send({ participantName: 'Bob' })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(errorSpy).toHaveBeenCalledWith('Error joining session:', error);
  });

  it('GET /api/options/:sessionCode should return INTERNAL_ERROR for unexpected Redis failures', async () => {
    const error = new Error('boom');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(redis, 'exists').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/options/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(errorSpy).toHaveBeenCalledWith('Error getting restaurants:', error);
  });
});

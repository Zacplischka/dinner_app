import { captureLogs } from '../helpers/logCapture.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';
import { sessionService as SessionService } from '../../src/server.js';

describe('REST API internal error branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/sessions should return INTERNAL_ERROR for unexpected create failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
    vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(error);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Error creating session')[0]).toMatchObject({
      err: { message: error.message },
    });
  });

  it('GET /api/sessions/:sessionCode should return INTERNAL_ERROR for unexpected lookup failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
    vi.spyOn(SessionService, 'getSession').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/sessions/AB123').expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Unhandled request error')[0]).toMatchObject({
      err: { message: error.message },
    });
  });

  it('should return JSON VALIDATION_ERROR for malformed request bodies, not HTML', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['x-request-id']).toMatch(/\S+/);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON',
    });
  });

  it('GET /api/options/:sessionCode should return INTERNAL_ERROR for unexpected Redis failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
    vi.spyOn(redis, 'exists').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/options/AB123').expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Unhandled request error')[0]).toMatchObject({
      err: { message: error.message },
    });
  });
});

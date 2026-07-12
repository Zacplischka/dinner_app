import { captureLogs } from '../helpers/logCapture.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';
import { sessionService as SessionService } from '../../src/services/SessionService.js';

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
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Error creating session')[0]).toMatchObject({ err: { message: error.message } });
  });

  it('GET /api/sessions/:sessionCode should return INTERNAL_ERROR for unexpected lookup failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
    vi.spyOn(SessionService, 'getSession').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/sessions/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Error getting session')[0]).toMatchObject({ err: { message: error.message } });
  });

  it('POST /api/sessions/:sessionCode/join should return INTERNAL_ERROR for unexpected join failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
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
    expect(logs.withMsg('Error joining session')[0]).toMatchObject({ err: { message: error.message } });
  });

  it('should return JSON INVALID_JSON for malformed request bodies, not HTML', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: 'Bad Request',
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON',
    });
  });

  it('GET /api/options/:sessionCode should return INTERNAL_ERROR for unexpected Redis failures', async () => {
    const error = new Error('boom');
    const logs = captureLogs();
    vi.spyOn(redis, 'exists').mockRejectedValueOnce(error);

    const response = await request(app).get('/api/options/ABC123').expect(500);

    expect(response.body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(logs.withMsg('Error getting restaurants')[0]).toMatchObject({ err: { message: error.message } });
  });
});

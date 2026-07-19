import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createGeocodeRouter } from '../../src/api/geocode.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function buildApp(deps: {
  geocodeArea?: (
    query: string
  ) => Promise<{ latitude: number; longitude: number; area?: string } | undefined>;
  reverseGeocodeSuburb?: (latitude: number, longitude: number) => Promise<string | undefined>;
}) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    next();
  });
  app.use(
    '/api/geocode',
    createGeocodeRouter({
      geocodeArea: deps.geocodeArea ?? vi.fn(),
      reverseGeocodeSuburb: deps.reverseGeocodeSuburb ?? vi.fn(),
    })
  );
  app.use(errorHandler);
  return app;
}

describe('GET /api/geocode', () => {
  it('resolves a suburb/postcode query to coordinates and an area name', async () => {
    const geocodeArea = vi.fn().mockResolvedValue({
      latitude: -37.8238936,
      longitude: 144.9982667,
      area: 'Richmond VIC 3121, Australia',
    });

    const response = await request(buildApp({ geocodeArea }))
      .get('/api/geocode?query=Richmond 3121')
      .expect(200);

    expect(geocodeArea).toHaveBeenCalledWith('Richmond 3121');
    expect(response.body).toEqual({
      latitude: -37.8238936,
      longitude: 144.9982667,
      area: 'Richmond VIC 3121, Australia',
    });
  });

  it('returns 404 AREA_NOT_FOUND when the query does not resolve', async () => {
    const geocodeArea = vi.fn().mockResolvedValue(undefined);

    const response = await request(buildApp({ geocodeArea }))
      .get('/api/geocode?query=xzqnotaplace')
      .expect(404);

    expect(response.body.code).toBe('AREA_NOT_FOUND');
    expect(response.body.message).toMatch(/suburb or postcode/);
  });

  it('rejects a missing or too-short query', async () => {
    const geocodeArea = vi.fn();

    const response = await request(buildApp({ geocodeArea }))
      .get('/api/geocode?query=a')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(geocodeArea).not.toHaveBeenCalled();
  });

  it('reverse geocodes coordinates to a best-effort area name', async () => {
    const reverseGeocodeSuburb = vi.fn().mockResolvedValue('Melbourne');

    const response = await request(buildApp({ reverseGeocodeSuburb }))
      .get('/api/geocode?latitude=-37.81&longitude=144.96')
      .expect(200);

    expect(reverseGeocodeSuburb).toHaveBeenCalledWith(-37.81, 144.96);
    expect(response.body).toEqual({ latitude: -37.81, longitude: 144.96, area: 'Melbourne' });
  });

  it('still succeeds without an area when reverse geocoding fails', async () => {
    const reverseGeocodeSuburb = vi.fn().mockRejectedValue(new Error('geocode down'));

    const response = await request(buildApp({ reverseGeocodeSuburb }))
      .get('/api/geocode?latitude=-37.81&longitude=144.96')
      .expect(200);

    expect(response.body).toEqual({ latitude: -37.81, longitude: 144.96 });
  });

  it('rejects out-of-range coordinates', async () => {
    const response = await request(buildApp({}))
      .get('/api/geocode?latitude=95&longitude=144.96')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits repeated lookups per IP', async () => {
    const geocodeArea = vi.fn().mockResolvedValue({ latitude: -37.8, longitude: 144.9 });
    const app = buildApp({ geocodeArea });

    for (let i = 0; i < 20; i++) {
      await request(app).get('/api/geocode?query=Richmond').expect(200);
    }
    const response = await request(app).get('/api/geocode?query=Richmond').expect(429);

    expect(response.body.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('surfaces geocoding provider failures as 500', async () => {
    const geocodeArea = vi.fn().mockRejectedValue(new Error('Geocoding API error: Bad Gateway'));

    const response = await request(buildApp({ geocodeArea }))
      .get('/api/geocode?query=Richmond')
      .expect(500);

    expect(response.body.code).toBe('INTERNAL_ERROR');
  });
});

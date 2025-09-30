import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, waitForRedis } from '../helpers/testSetup.js';

describe('Contract Test: GET /api/options', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    // Ensure Redis is connected
    await waitForRedis(redis);
  });

  afterAll(async () => {
    // Note: Redis connection is shared
  });

  it('should return 200 with array of DinnerOption objects', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect('Content-Type', /json/)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('options');
    expect(Array.isArray(response.body.options)).toBe(true);
    expect(response.body.options.length).toBeGreaterThan(0);
  });

  it('should validate each DinnerOption matches OpenAPI schema', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect(200);

    const options = response.body.options;

    // Each option must have required fields
    options.forEach((option: any) => {
      expect(option).toHaveProperty('optionId');
      expect(typeof option.optionId).toBe('string');
      expect(option.optionId.length).toBeGreaterThan(0);

      expect(option).toHaveProperty('displayName');
      expect(typeof option.displayName).toBe('string');
      expect(option.displayName.length).toBeGreaterThan(0);

      // description is optional
      if (option.description !== undefined) {
        expect(typeof option.description).toBe('string');
      }
    });
  });

  it('should return unique optionId values', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect(200);

    const options = response.body.options;
    const optionIds = options.map((opt: any) => opt.optionId);
    const uniqueIds = new Set(optionIds);

    expect(uniqueIds.size).toBe(options.length); // All IDs should be unique
  });

  it('should return static list (same on multiple requests)', async () => {
    const response1 = await request(app)
      .get('/api/options')
      .expect(200);

    const response2 = await request(app)
      .get('/api/options')
      .expect(200);

    // Should return identical lists (static hardcoded per FR-018)
    expect(response1.body.options).toEqual(response2.body.options);
  });

  it('should return at least 10 dinner options', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect(200);

    // Based on spec mentioning 15-20 options in data-model.md
    expect(response.body.options.length).toBeGreaterThanOrEqual(10);
  });

  it('should include common option examples from specification', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect(200);

    const options = response.body.options;
    const optionIds = options.map((opt: any) => opt.optionId);

    // Check for examples mentioned in OpenAPI spec
    expect(optionIds).toContain('pizza-palace');
    expect(optionIds).toContain('sushi-spot');
    expect(optionIds).toContain('thai-kitchen');
  });

  it('should have consistent displayName format', async () => {
    const response = await request(app)
      .get('/api/options')
      .expect(200);

    const options = response.body.options;

    options.forEach((option: any) => {
      // Display names should be title case and readable
      expect(option.displayName).not.toBe(option.displayName.toLowerCase());
      expect(option.displayName.length).toBeGreaterThan(2);
    });
  });
});
import { afterEach, describe, it, expect, vi } from 'vitest';
import { config } from '../../src/config/index.js';

describe('Google Places API Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.doUnmock('dotenv');
    vi.resetModules();
  });

  it('should have GOOGLE_PLACES_API_KEY in environment', () => {
    expect(config.googlePlaces.apiKey).toBeDefined();
    expect(config.googlePlaces.apiKey).toBeTruthy();
  });

  it('should load explicit environment values at module initialization', async () => {
    vi.resetModules();
    vi.doMock('dotenv', () => ({
      default: { config: vi.fn() },
    }));
    Object.assign(process.env, {
      FRONTEND_URL: 'https://dinder.example.test',
      GOOGLE_PLACES_API_KEY: 'places-key',
      APIFY_TOKEN: 'apify-token',
      APIFY_UBER_EATS_ACTOR_ID: 'example/uber-eats',
      APIFY_DOORDASH_ACTOR_ID: 'example/doordash',
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });

    const { config: loadedConfig } = await import('../../src/config/index.js');

    expect(loadedConfig).toMatchObject({
      frontendUrl: 'https://dinder.example.test',
      googlePlaces: {
        apiKey: 'places-key',
      },
      apify: {
        token: 'apify-token',
        uberEatsActorId: 'example/uber-eats',
        doorDashActorId: 'example/doordash',
      },
      supabase: {
        url: 'https://supabase.example.test',
        serviceRoleKey: 'service-role',
      },
    });
  });

  it('should load default values when optional environment values are missing', async () => {
    vi.resetModules();
    vi.doMock('dotenv', () => ({
      default: { config: vi.fn() },
    }));
    for (const key of [
      'FRONTEND_URL',
      'APIFY_TOKEN',
      'APIFY_UBER_EATS_ACTOR_ID',
      'APIFY_DOORDASH_ACTOR_ID',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]) {
      delete process.env[key];
    }
    process.env.GOOGLE_PLACES_API_KEY = 'places-key';

    const { config: loadedConfig } = await import('../../src/config/index.js');

    expect(loadedConfig).toMatchObject({
      frontendUrl: 'http://localhost:3000',
      googlePlaces: {
        apiKey: 'places-key',
      },
      apify: {
        token: undefined,
        uberEatsActorId: 'borderline/uber-eats-scraper-ppr',
        doorDashActorId: 'abotapi/doordash-scraper',
      },
      supabase: {
        url: '',
        serviceRoleKey: '',
      },
    });
  });
});

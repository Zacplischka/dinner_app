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

  it('should have GOOGLE_PLACES_API_URL in environment', () => {
    expect(config.googlePlaces.apiUrl).toBeDefined();
    expect(config.googlePlaces.apiUrl).toBe('https://places.googleapis.com/v1/places:searchNearby');
  });


  it('should load explicit environment values at module initialization', async () => {
    vi.resetModules();
    vi.doMock('dotenv', () => ({
      default: { config: vi.fn() },
    }));
    Object.assign(process.env, {
      PORT: '4444',
      REDIS_HOST: 'redis.example.test',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'redis-secret',
      FRONTEND_URL: 'https://dinder.example.test',
      NODE_ENV: 'test',
      GOOGLE_PLACES_API_KEY: 'places-key',
      GOOGLE_PLACES_API_URL: 'https://places.example.test/search',
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_JWT_SECRET: 'jwt-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    });

    const { config: loadedConfig } = await import('../../src/config/index.js');

    expect(loadedConfig).toMatchObject({
      port: 4444,
      redisHost: 'redis.example.test',
      redisPort: 6380,
      redisPassword: 'redis-secret',
      frontendUrl: 'https://dinder.example.test',
      nodeEnv: 'test',
      googlePlaces: {
        apiKey: 'places-key',
        apiUrl: 'https://places.example.test/search',
      },
      supabase: {
        url: 'https://supabase.example.test',
        jwtSecret: 'jwt-secret',
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
      'PORT',
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_PASSWORD',
      'FRONTEND_URL',
      'NODE_ENV',
      'GOOGLE_PLACES_API_URL',
      'SUPABASE_URL',
      'SUPABASE_JWT_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]) {
      delete process.env[key];
    }
    process.env.GOOGLE_PLACES_API_KEY = 'places-key';

    const { config: loadedConfig } = await import('../../src/config/index.js');

    expect(loadedConfig).toMatchObject({
      port: 3001,
      redisHost: 'localhost',
      redisPort: 6379,
      redisPassword: '',
      frontendUrl: 'http://localhost:3000',
      nodeEnv: 'development',
      googlePlaces: {
        apiKey: 'places-key',
        apiUrl: 'https://places.googleapis.com/v1/places:searchNearby',
      },
      supabase: {
        url: '',
        jwtSecret: '',
        serviceRoleKey: '',
      },
    });
  });
});

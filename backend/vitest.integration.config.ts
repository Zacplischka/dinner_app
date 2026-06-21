import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests validate WebSocket flows and Redis interactions
    include: ['tests/integration/**/*.test.ts'],

    // Run test files sequentially to avoid Redis data conflicts
    fileParallelism: false,

    // Global timeout for integration tests (includes WebSocket communication)
    testTimeout: 15000,

    // Environment variables for test Redis connection
    env: {
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
      SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role',
      NODE_ENV: 'test',
    },
  },
});

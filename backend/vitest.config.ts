import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially to avoid Redis data conflicts
    // Individual tests within a file still run in parallel
    fileParallelism: false,

    // Global timeout for all tests
    testTimeout: 10000,

    env: {
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
      SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role',
      NODE_ENV: 'test',
    },

    // Setup files (if needed in future)
    // setupFiles: ['./tests/setup.ts'],
  },
});

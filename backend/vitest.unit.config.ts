import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests for services, models, and utilities
    include: ['tests/unit/**/*.test.ts'],

    // Unit tests run against in-memory ioredis-mock instances. Vitest's
    // default per-file module isolation gives each test file its own mock
    // module state, so files can run in parallel (don't disable `isolate`).
    fileParallelism: true,

    // Global timeout for unit tests (should be fast)
    testTimeout: 5000,

    // Environment variables
    env: {
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
      NODE_ENV: 'test',
    },
  },
});

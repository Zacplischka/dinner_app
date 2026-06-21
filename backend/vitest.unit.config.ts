import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests for services, models, and utilities
    include: ['tests/unit/**/*.test.ts'],

    // Redis-backed unit tests share one local Redis database and fixed keys.
    // Keep files serial so cleanup in one file cannot race another file.
    fileParallelism: false,

    // Global timeout for unit tests (should be fast)
    testTimeout: 5000,

    // Environment variables
    env: {
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
      NODE_ENV: 'test',
    },
  },
});

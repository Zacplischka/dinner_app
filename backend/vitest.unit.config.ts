import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests for services, models, and utilities
    include: ['tests/unit/**/*.test.ts'],

    // Unit tests run against in-memory ioredis-mock instances (one shared
    // keyspace per worker process), so files can run in parallel.
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

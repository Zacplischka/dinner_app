import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests for services, models, and utilities
    include: ['tests/unit/**/*.test.ts'],

    // Unit tests can run in parallel (no shared state)
    fileParallelism: true,

    // Global timeout for unit tests (should be fast)
    testTimeout: 5000,

    // Environment variables
    env: {
      NODE_ENV: 'test',
    },
  },
});

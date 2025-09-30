import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Contract tests validate API/WebSocket schemas match specifications
    include: ['tests/contract/**/*.test.ts'],

    // Run test files sequentially to avoid Redis data conflicts
    fileParallelism: false,

    // Global timeout for contract tests (includes Redis I/O)
    testTimeout: 10000,

    // Environment variables for test Redis connection
    env: {
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
      NODE_ENV: 'test',
    },
  },
});
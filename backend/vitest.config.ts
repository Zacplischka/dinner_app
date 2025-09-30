import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially to avoid Redis data conflicts
    // Individual tests within a file still run in parallel
    fileParallelism: false,

    // Global timeout for all tests
    testTimeout: 10000,

    // Setup files (if needed in future)
    // setupFiles: ['./tests/setup.ts'],
  },
});
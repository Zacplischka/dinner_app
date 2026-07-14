import { defineWorkspace } from 'vitest/config';

const unitEnv = {
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
  NODE_ENV: 'test',
};

const serviceEnv = {
  ...unitEnv,
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role',
};

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      fileParallelism: true,
      testTimeout: 5000,
      env: unitEnv,
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      // fileParallelism is ignored inside workspace projects on vitest 1.x;
      // singleThread is the knob that actually serializes files, which the
      // shared-Redis cleanupTestData() wildcard requires.
      poolOptions: { threads: { singleThread: true } },
      testTimeout: 15000,
      env: serviceEnv,
    },
  },
  {
    test: {
      name: 'contract',
      include: ['tests/contract/**/*.test.ts'],
      poolOptions: { threads: { singleThread: true } },
      testTimeout: 10000,
      env: serviceEnv,
    },
  },
]);

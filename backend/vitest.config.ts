import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const unitEnv = {
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'test-google-places-key',
  NODE_ENV: 'test',
};

// The corpus is reference data read at boot, so every suite that boots the app
// is pointed at a fixed fixture corpus — three italian vegetarian mains —
// instead of the batch that ships this week (#338). It is the same
// substitutable seam the Spoonacular fake uses, one layer out: these tests
// state what the blend does, not what the corpus happens to hold, so growing
// or re-cuisining the shipped batch cannot turn them red. The unit project sets
// no override, which is what lets tests/unit/shippedCorpus.test.ts deal and cook
// the batch that actually ships.
//
// The Movie corpus is pointed at a fixture for the same reason (ADR 0014), and
// for one more: with thousands of titles no in-vocabulary Mood is reliably
// empty, so the fixture — 24 titles, no Documentary — is what keeps the
// NO_MOVIES_FOUND contract case a fact. Its poster paths are placeholders.
const serviceEnv = {
  ...unitEnv,
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role',
  OWNED_RECIPES_DIR: fileURLToPath(new URL('tests/fixtures/owned-recipes/', import.meta.url)),
  MOVIES_FILE: fileURLToPath(new URL('tests/fixtures/movies.json', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          pool: 'threads',
          include: ['tests/unit/**/*.test.ts'],
          fileParallelism: true,
          testTimeout: 5000,
          env: unitEnv,
        },
      },
      {
        test: {
          name: 'integration',
          pool: 'threads',
          include: ['tests/integration/**/*.test.ts'],
          // Keep the explicit threads pool and serialized files: the shared-Redis
          // cleanupTestData() wildcard cannot run across parallel test files.
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 15000,
          env: serviceEnv,
        },
      },
      {
        test: {
          name: 'contract',
          pool: 'threads',
          include: ['tests/contract/**/*.test.ts'],
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 10000,
          env: serviceEnv,
        },
      },
    ],
  },
});

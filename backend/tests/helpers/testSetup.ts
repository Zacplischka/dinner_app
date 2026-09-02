// Test setup helpers for proper Redis and server management
import Redis from 'ioredis';

// Every key written under vitest is namespaced with this prefix — both by the
// app under test (src/redis/client.ts applies it when VITEST is set) and by
// this test client. Cleanup sweeps strictly inside it, so a shared dev Redis
// can never lose real data to a test run.
export const TEST_KEY_PREFIX = 'test:';

let redisClient: Redis | null = null;

/**
 * Get or create a shared Redis client for tests
 * Prevents multiple connections and quit() conflicts
 */
export function getTestRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: false,
      keyPrefix: TEST_KEY_PREFIX,
    });
  }
  return redisClient;
}

/**
 * KEYS ignores ioredis's keyPrefix (documented ioredis behaviour), so prefix
 * the pattern by hand and strip the prefix off the results — the returned
 * names are then valid arguments for this client's other commands, which
 * re-apply the prefix themselves.
 */
export async function testKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys = await redis.keys(TEST_KEY_PREFIX + pattern);
  return keys.map((key) => key.slice(TEST_KEY_PREFIX.length));
}

/**
 * Clean up all test data from Redis.
 * Deletes only keys under the test-specific prefix — never live data.
 */
export async function cleanupTestData(redis: Redis): Promise<void> {
  // Shopping Lists are swept here too: any test that completes a Cook Session
  // mints one, and unlike a Session it carries a 7-day TTL — left behind, they
  // accumulate across runs in the shared dev Redis (#262).
  // The vendor-dark latch (#333) is swept too: a test that darkens Spoonacular
  // leaves it latched for five minutes, and the next file's cold deal would
  // silently deal owned-only instead of calling its own fake.
  for (const pattern of ['session:*', 'participant:*', 'shoppinglist:*', 'recipes:vendor:*']) {
    const keys = await testKeys(redis, pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

/**
 * Wait for Redis to be ready
 */
export async function waitForRedis(redis: Redis, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await redis.ping();
      return;
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

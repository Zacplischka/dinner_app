// Test setup helpers for proper Redis and server management
import Redis from 'ioredis';

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
    });
  }
  return redisClient;
}

/**
 * Clean up all test data from Redis
 * Use a test-specific key prefix to avoid conflicts
 */
export async function cleanupTestData(redis: Redis): Promise<void> {
  // Shopping Lists are swept here too: any test that completes a Cook Session
  // mints one, and unlike a Session it carries a 7-day TTL — left behind, they
  // accumulate across runs in the shared dev Redis (#262).
  for (const pattern of ['session:*', 'participant:*', 'shoppinglist:*']) {
    const keys = await redis.keys(pattern);
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

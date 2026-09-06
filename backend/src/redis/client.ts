// Redis client initialization with reconnection strategy

import { logger } from '../logger.js';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Under vitest every key this process writes is namespaced `test:`, so the
// contract/integration suites can never touch — and their cleanup can never
// delete — real data on a shared Redis. Must match testSetup.TEST_KEY_PREFIX.
export const KEY_PREFIX = process.env.VITEST ? 'test:' : '';

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  keyPrefix: KEY_PREFIX,
  family: 0,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (error) => {
  logger.error({ err: error }, 'Redis error');
});

// Health check utility
export async function pingRedis(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error({ err: error }, 'Redis ping failed');
    return false;
  }
}

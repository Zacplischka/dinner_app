// Redis client initialization with reconnection strategy
// Based on: specs/001-dinner-decider-enables/research.md

import { logger } from '../logger.js';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.info({ delayMs: delay, attempt: times }, 'Redis reconnecting');
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

// Event listeners for monitoring
redis.on('connect', () => {
  logger.info('✓ Redis connected');
});

redis.on('ready', () => {
  logger.info('✓ Redis ready');
});

redis.on('error', (error) => {
  logger.error({ err: error }, 'Redis error');
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
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

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis disconnected gracefully');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting Redis');
    redis.disconnect();
  }
}
import { logger } from '../../src/logger.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock ioredis so this suite never opens a real connection; the mock keeps
// EventEmitter semantics because client.ts wires lifecycle logging via .on().
vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events');
  class MockRedis extends EventEmitter {
    options: unknown;
    ping = vi.fn();
    quit = vi.fn();
    disconnect = vi.fn();

    constructor(options: unknown) {
      super();
      this.options = options;
    }
  }
  return { default: MockRedis };
});

const { redis, pingRedis } = await import('../../src/redis/client.js');

describe('redis client helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.doUnmock('ioredis');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('should expose retry delay strategy capped at 2 seconds', () => {
    const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const retryStrategy = (redis as any).options.retryStrategy;

    expect(retryStrategy(1)).toBe(50);
    expect(retryStrategy(100)).toBe(2000);
    expect(logSpy).toHaveBeenCalledWith({ delayMs: 50, attempt: 1 }, 'Redis reconnecting');
    expect(logSpy).toHaveBeenCalledWith({ delayMs: 2000, attempt: 100 }, 'Redis reconnecting');
  });

  it('should report healthy Redis pings', async () => {
    vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG' as any);

    await expect(pingRedis()).resolves.toBe(true);
  });

  it('should report failed Redis pings', async () => {
    const error = new Error('down');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(redis, 'ping').mockRejectedValueOnce(error);

    await expect(pingRedis()).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith({ err: error }, 'Redis ping failed');
  });

  it('should log Redis client lifecycle events', () => {
    const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(() => redis.emit('connect')).not.toThrow();
    expect(() => redis.emit('ready')).not.toThrow();
    const eventError = new Error('event error');
    expect(() => redis.emit('error', eventError)).not.toThrow();
    expect(() => redis.emit('close')).not.toThrow();
    expect(() => redis.emit('reconnecting')).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith('✓ Redis connected');
    expect(logSpy).toHaveBeenCalledWith('✓ Redis ready');
    expect(errorSpy).toHaveBeenCalledWith({ err: eventError }, 'Redis error');
    expect(logSpy).toHaveBeenCalledWith('Redis connection closed');
    expect(logSpy).toHaveBeenCalledWith('Redis reconnecting...');
  });

  it('should initialize Redis with default connection options when env is missing', async () => {
    const instances: any[] = [];
    vi.resetModules();
    vi.doMock('ioredis', () => ({
      default: class MockRedis {
        options: unknown;
        on = vi.fn();
        ping = vi.fn();
        quit = vi.fn();
        disconnect = vi.fn();

        constructor(options: unknown) {
          this.options = options;
          instances.push(this);
        }
      },
    }));
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;

    const { redis: loadedRedis } = await import('../../src/redis/client.js');

    expect(loadedRedis).toBe(instances[0]);
    expect(instances[0].options).toMatchObject({
      host: 'localhost',
      port: 6379,
      password: undefined,
      family: 0,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  });
});

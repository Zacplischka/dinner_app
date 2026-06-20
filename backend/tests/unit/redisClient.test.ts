import { afterEach, describe, expect, it, vi } from 'vitest';
import { redis, pingRedis, disconnectRedis } from '../../src/redis/client.js';

describe('redis client helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.doUnmock('ioredis');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('should expose retry delay strategy capped at 2 seconds', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const retryStrategy = (redis as any).options.retryStrategy;

    expect(retryStrategy(1)).toBe(50);
    expect(retryStrategy(100)).toBe(2000);
    expect(logSpy).toHaveBeenCalledWith('Redis reconnecting in 50ms (attempt 1)...');
    expect(logSpy).toHaveBeenCalledWith('Redis reconnecting in 2000ms (attempt 100)...');
  });

  it('should report healthy Redis pings', async () => {
    vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG' as any);

    await expect(pingRedis()).resolves.toBe(true);
  });

  it('should report failed Redis pings', async () => {
    const error = new Error('down');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(redis, 'ping').mockRejectedValueOnce(error);

    await expect(pingRedis()).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Redis ping failed:', error);
  });

  it('should quit Redis gracefully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(redis, 'quit').mockResolvedValueOnce('OK' as any);

    await expect(disconnectRedis()).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith('Redis disconnected gracefully');
  });

  it('should disconnect Redis when graceful quit fails', async () => {
    const error = new Error('quit failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(redis, 'quit').mockRejectedValueOnce(error);
    const disconnect = vi.spyOn(redis, 'disconnect').mockImplementation(() => undefined);

    await disconnectRedis();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('Error disconnecting Redis:', error);
  });

  it('should log Redis client lifecycle events', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => redis.emit('connect')).not.toThrow();
    expect(() => redis.emit('ready')).not.toThrow();
    expect(() => redis.emit('error', new Error('event error'))).not.toThrow();
    expect(() => redis.emit('close')).not.toThrow();
    expect(() => redis.emit('reconnecting')).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith('✓ Redis connected');
    expect(logSpy).toHaveBeenCalledWith('✓ Redis ready');
    expect(errorSpy).toHaveBeenCalledWith('Redis error:', 'event error');
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
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  });
});

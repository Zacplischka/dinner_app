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
    const retryStrategy = (redis as any).options.retryStrategy;

    expect(retryStrategy(1)).toBe(50);
    expect(retryStrategy(100)).toBe(2000);
  });

  it('should report healthy Redis pings', async () => {
    vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG' as any);

    await expect(pingRedis()).resolves.toBe(true);
  });

  it('should report failed Redis pings', async () => {
    vi.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('down'));

    await expect(pingRedis()).resolves.toBe(false);
  });

  it('should quit Redis gracefully', async () => {
    vi.spyOn(redis, 'quit').mockResolvedValueOnce('OK' as any);

    await expect(disconnectRedis()).resolves.toBeUndefined();
  });

  it('should disconnect Redis when graceful quit fails', async () => {
    vi.spyOn(redis, 'quit').mockRejectedValueOnce(new Error('quit failed'));
    const disconnect = vi.spyOn(redis, 'disconnect').mockImplementation(() => undefined);

    await disconnectRedis();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('should log Redis client lifecycle events', () => {
    expect(() => redis.emit('error', new Error('event error'))).not.toThrow();
    expect(() => redis.emit('close')).not.toThrow();
    expect(() => redis.emit('reconnecting')).not.toThrow();
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

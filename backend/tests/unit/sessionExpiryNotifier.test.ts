import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  instances: [] as Array<any>,
  configError: null as Error | null,
}));

vi.mock('ioredis', () => ({
  default: class MockRedis extends EventEmitter {
    options: unknown;
    subscribe = vi.fn(async () => 1);
    quit = vi.fn(async () => 'OK');

    constructor(options: unknown) {
      super();
      this.options = options;
      redisState.instances.push(this);
    }

    async config() {
      if (redisState.configError) {
        throw redisState.configError;
      }
      return 'OK';
    }
  },
}));

describe('session expiry notifier', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    redisState.instances = [];
    redisState.configError = null;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function ioMock() {
    const emit = vi.fn();
    return {
      emit,
      io: {
        to: vi.fn(() => ({ emit })),
      },
    };
  }

  it('should log notifier initialization and disconnection', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);

    expect(logSpy).toHaveBeenCalledWith('✓ Redis keyspace notifications enabled');
    expect(redisState.instances[0].subscribe).toHaveBeenCalledWith('__keyevent@0__:expired');
    expect(logSpy).toHaveBeenCalledWith('✓ Session expiry notifier initialized');

    await disconnectSessionExpiryNotifier();

    expect(redisState.instances[0].quit).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('Session expiry notifier disconnected');
  });

  it('should emit and log valid expired session keys', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { io, emit } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);
    redisState.instances[0].emit('message', '__keyevent@0__:expired', 'session:ABC123');

    expect(logSpy).toHaveBeenCalledWith('Session expired: ABC123');
    expect(io.to).toHaveBeenCalledWith('ABC123');
    expect(emit).toHaveBeenCalledWith('session:expired', {
      sessionCode: 'ABC123',
      reason: 'inactivity',
      message: 'Session has expired due to inactivity',
    });

    await disconnectSessionExpiryNotifier();
  });

  it('should continue when Redis config is disabled and log subscriber errors', async () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    redisState.configError = new Error('CONFIG disabled');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);

    expect(redisState.instances[0].options).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to enable Redis keyspace notifications:',
      redisState.configError
    );

    redisState.instances[0].emit('error', new Error('subscriber down'));

    expect(errorSpy).toHaveBeenCalledWith('Redis subscriber error:', 'subscriber down');

    await disconnectSessionExpiryNotifier();
    expect(redisState.instances[0].quit).toHaveBeenCalledOnce();
  });

  it('should ignore malformed expired session keys', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);
    redisState.instances[0].emit('message', '__keyevent@0__:expired', 'session:INVALID');

    expect(warnSpy).toHaveBeenCalledWith('Invalid session code from expired key: session:INVALID');
    expect(io.to).not.toHaveBeenCalled();

    await disconnectSessionExpiryNotifier();
  });
});

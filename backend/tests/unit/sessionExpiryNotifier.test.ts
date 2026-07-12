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

  // vi.resetModules() gives each test a fresh module registry, so the logger
  // must be re-imported per test to spy on the instance the notifier uses.
  let logger: typeof import('../../src/logger.js').logger;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    redisState.instances = [];
    redisState.configError = null;
    vi.resetModules();
    ({ logger } = await import('../../src/logger.js'));
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // Importing the notifier also imports the store, whose redis client is
  // constructed under the same mock - the subscriber is the LAST instance.
  function subscriber() {
    return redisState.instances[redisState.instances.length - 1];
  }

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
    const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);

    expect(logSpy).toHaveBeenCalledWith('✓ Redis keyspace notifications enabled');
    expect(subscriber().subscribe).toHaveBeenCalledWith('__keyevent@0__:expired');
    expect(logSpy).toHaveBeenCalledWith('✓ Session expiry notifier initialized');

    const notifierInstance = subscriber();
    await disconnectSessionExpiryNotifier();

    expect(notifierInstance.quit).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('Session expiry notifier disconnected');
  });

  it('should emit and log valid expired session keys', async () => {
    const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const { io, emit } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);
    subscriber().emit('message', '__keyevent@0__:expired', 'session:ABC123');

    expect(logSpy).toHaveBeenCalledWith({ sessionCode: 'ABC123' }, 'Session expired');
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
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);

    expect(subscriber().options).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      { err: redisState.configError },
      'Failed to enable Redis keyspace notifications'
    );

    subscriber().emit('error', new Error('subscriber down'));

    expect(errorSpy).toHaveBeenCalledWith({ err: 'subscriber down' }, 'Redis subscriber error');

    const notifierInstance = subscriber();
    await disconnectSessionExpiryNotifier();
    expect(notifierInstance.quit).toHaveBeenCalledOnce();
  });

  it('should silently ignore malformed and sub-key expirations', async () => {
    const { io } = ioMock();
    const { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } = await import(
      '../../src/redis/sessionExpiryNotifier.js'
    );

    await initializeSessionExpiryNotifier(io as any);
    subscriber().emit('message', '__keyevent@0__:expired', 'session:INVALID');
    subscriber().emit('message', '__keyevent@0__:expired', 'session:ABC123:results');
    subscriber().emit('message', '__keyevent@0__:expired', 'participant:xyz');

    expect(io.to).not.toHaveBeenCalled();

    await disconnectSessionExpiryNotifier();
  });
});

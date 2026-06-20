import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as SessionModel from '../../src/models/Session.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as SessionService from '../../src/services/SessionService.js';
import { refreshSessionTtl } from '../../src/redis/ttl-utils.js';
import {
  initializeSessionExpiryNotifier,
  disconnectSessionExpiryNotifier,
} from '../../src/redis/sessionExpiryNotifier.js';

describe('Integration Test: Session Expiration (FR-019, FR-020)', () => {
  const sessionCode = 'EXP123';
  let redis: Redis;

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await disconnectSessionExpiryNotifier();
    await cleanupTestData(redis);
  });

  async function createCompleteSession(): Promise<void> {
    await SessionModel.createSession(sessionCode, 'alice', 'Alice');
    await ParticipantModel.addParticipant(sessionCode, 'alice', 'Alice', true);
    await ParticipantModel.addParticipant(sessionCode, 'bob', 'Bob');
    await redis.sadd(`session:${sessionCode}:alice:selections`, 'place1');
    await redis.sadd(`session:${sessionCode}:bob:selections`, 'place1');
    await redis.sadd(`session:${sessionCode}:results`, 'place1');
  }

  it('should refresh session-related keys with a 30-minute TTL', async () => {
    await createCompleteSession();

    await refreshSessionTtl(sessionCode, ['alice', 'bob']);

    for (const key of [
      `session:${sessionCode}`,
      `session:${sessionCode}:participants`,
      `participant:alice`,
      `participant:bob`,
      `session:${sessionCode}:alice:selections`,
      `session:${sessionCode}:bob:selections`,
      `session:${sessionCode}:results`,
    ]) {
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(1700);
      expect(ttl).toBeLessThanOrEqual(1800);
    }
  });

  it('should delete all related keys when a session expires', async () => {
    await createCompleteSession();

    await SessionService.expireSession(sessionCode);

    for (const key of [
      `session:${sessionCode}`,
      `session:${sessionCode}:participants`,
      `participant:alice`,
      `participant:bob`,
      `session:${sessionCode}:alice:selections`,
      `session:${sessionCode}:bob:selections`,
      `session:${sessionCode}:results`,
    ]) {
      await expect(redis.exists(key)).resolves.toBe(0);
    }
  });

  it('should broadcast session:expired when Redis expires the session key', async () => {
    const emit = vi.fn();
    const io = {
      to: vi.fn(() => ({ emit })),
    };

    await initializeSessionExpiryNotifier(io as any);
    await redis.set(`session:${sessionCode}`, 'expiring', 'EX', 1);

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const interval = setInterval(() => {
        if (emit.mock.calls.length > 0) {
          clearInterval(interval);
          resolve();
          return;
        }

        if (Date.now() > deadline) {
          clearInterval(interval);
          reject(new Error('Timed out waiting for session expiration event'));
        }
      }, 50);
    });

    expect(io.to).toHaveBeenCalledWith(sessionCode);
    expect(emit).toHaveBeenCalledWith('session:expired', {
      sessionCode,
      reason: 'inactivity',
      message: 'Session has expired due to inactivity',
    });
  });
});

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { sessionStore as store } from '../../src/store/sessionStore.js';
import { sessionService as SessionService } from '../../src/services/SessionService.js';
import {
  initializeSessionExpiryNotifier,
  disconnectSessionExpiryNotifier,
} from '../../src/redis/sessionExpiryNotifier.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Integration Test: Session Expiration (FR-019, FR-020)', () => {
  const sessionCode = 'EXP123';
  let redis: Redis;

  const restaurants: Restaurant[] = [
    { placeId: 'place1', name: 'Pizza Palace', rating: 4.5, priceLevel: 2 },
  ];

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  afterEach(async () => {
    await disconnectSessionExpiryNotifier();
    await cleanupTestData(redis);
  });

  async function createCompleteSession(): Promise<void> {
    await store.createSession(sessionCode, {
      hostId: 'alice',
      hostName: 'Alice',
      restaurants,
    });
    await store.addParticipant(sessionCode, {
      participantId: 'alice',
      displayName: 'Alice',
      isHost: true,
    });
    await store.addParticipant(sessionCode, { participantId: 'bob', displayName: 'Bob' });
    await store.recordSubmission(sessionCode, 'alice', ['place1']);
    await store.recordSubmission(sessionCode, 'bob', ['place1']);
    await store.computeAndStoreResults(sessionCode);
  }

  it('should keep a 30-minute TTL on every session key after any mutation', async () => {
    await createCompleteSession();

    for (const key of [
      `session:${sessionCode}`,
      `session:${sessionCode}:participants`,
      `session:${sessionCode}:restaurant_ids`,
      `session:${sessionCode}:restaurants`,
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

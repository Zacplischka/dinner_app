import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { sessionStore as store, sessionService } from '../../src/server.js';
import { handleSessionRestart } from '../../src/websocket/restartHandler.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Integration Test: Session Restart (FR-012, FR-013)', () => {
  const sessionCode = 'RST12';
  let redis: Redis;

  const restaurants: Restaurant[] = [
    { placeId: 'place1', name: 'Pizza Palace', rating: 4.5, priceLevel: 2 },
    { placeId: 'place2', name: 'Sushi Spot', rating: 4.8, priceLevel: 3 },
  ];

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    await cleanupTestData(redis);
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
    await store.recordSubmission(sessionCode, 'alice', ['place1', 'place2']);
    await store.recordSubmission(sessionCode, 'bob', ['place2']);
    await store.computeAndStoreResults(sessionCode);
    await store.updateState(sessionCode, 'complete');
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  async function restartSession() {
    const emit = vi.fn();
    const io = {
      in: vi.fn(() => ({ emit })),
    };
    const callback = vi.fn();
    const socket = { id: 'alice' };

    await handleSessionRestart(socket as any, io as any, { sessionCode }, callback, sessionService);

    return { callback, io, emit };
  }

  it('should clear all selections from Redis', async () => {
    await restartSession();

    await expect(redis.exists(`session:${sessionCode}:alice:selections`)).resolves.toBe(0);
    await expect(redis.exists(`session:${sessionCode}:bob:selections`)).resolves.toBe(0);
    await expect(redis.exists(`session:${sessionCode}:results`)).resolves.toBe(0);
  });

  it('should broadcast session:restarted to all participants', async () => {
    const { callback, io, emit } = await restartSession();

    expect(callback).toHaveBeenCalledWith({ success: true, data: null });
    expect(io.in).toHaveBeenCalledWith(sessionCode);
    expect(emit).toHaveBeenCalledWith('session:restarted', {
      sessionCode,
      message: 'Session restarted. Make new selections.',
    });
  });

  it('should preserve participant list and reset submission state (FR-013)', async () => {
    await restartSession();

    await expect(redis.smembers(`session:${sessionCode}:participants`)).resolves.toEqual(
      expect.arrayContaining(['alice', 'bob'])
    );
    await expect(redis.hget(`participant:alice`, 'hasSubmitted')).resolves.toBe('0');
    await expect(redis.hget(`participant:bob`, 'hasSubmitted')).resolves.toBe('0');
    await expect(redis.hget(`session:${sessionCode}`, 'state')).resolves.toBe('selecting');
  });
});

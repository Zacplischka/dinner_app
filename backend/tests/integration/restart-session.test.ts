import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as SessionModel from '../../src/models/Session.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import { handleSessionRestart } from '../../src/websocket/restartHandler.js';

describe('Integration Test: Session Restart (FR-012, FR-013)', () => {
  const sessionCode = 'RST123';
  let redis: Redis;

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    await cleanupTestData(redis);
    await SessionModel.createSession(sessionCode, 'alice', 'Alice');
    await SessionModel.updateSessionState(sessionCode, 'complete');
    await ParticipantModel.addParticipant(sessionCode, 'alice', 'Alice', true);
    await ParticipantModel.addParticipant(sessionCode, 'bob', 'Bob');
    await ParticipantModel.markParticipantSubmitted('alice');
    await ParticipantModel.markParticipantSubmitted('bob');
    await redis.sadd(`session:${sessionCode}:alice:selections`, 'place1', 'place2');
    await redis.sadd(`session:${sessionCode}:bob:selections`, 'place2');
    await redis.sadd(`session:${sessionCode}:results`, 'place2');
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

    await handleSessionRestart(
      socket as any,
      io as any,
      { sessionCode },
      callback
    );

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

    expect(callback).toHaveBeenCalledWith({ success: true });
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

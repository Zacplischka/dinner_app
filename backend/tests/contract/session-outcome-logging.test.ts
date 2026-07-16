import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { captureLogs } from '../helpers/logCapture.js';
import { sessionStore as store, sessionService } from '../../src/server.js';
import type { Restaurant } from '@dinder/shared/types';

// Contract: every completed Session emits exactly one anonymous 'Session
// outcome' log line — counts and the session code only, no names (#69).
describe('Contract Test: session-outcome metrics log line', () => {
  const sessionCode = 'OUT12';
  let redis: Redis;

  const restaurants: Restaurant[] = [
    { placeId: 'place1', name: 'Pizza Palace', rating: 4.5, priceLevel: 2 },
    { placeId: 'place2', name: 'Sushi Spot', rating: 4.8, priceLevel: 3 },
    { placeId: 'place3', name: 'Taco Town', rating: 4.1, priceLevel: 1 },
  ];

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    await cleanupTestData(redis);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
  });

  async function seedSession(participantIds: string[]) {
    await store.createSession(sessionCode, {
      hostId: participantIds[0],
      hostName: participantIds[0],
      restaurants,
    });
    for (const [i, pid] of participantIds.entries()) {
      await store.addParticipant(sessionCode, {
        participantId: pid,
        displayName: pid,
        isHost: i === 0,
      });
    }
  }

  it('emits one outcome line when a three-participant session completes with a match', async () => {
    await seedSession(['alice', 'bob', 'carol']);
    const logs = captureLogs();

    await sessionService.submitSelections(sessionCode, 'alice', ['place1', 'place2']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place1', 'place2']);
    await sessionService.submitSelections(sessionCode, 'carol', ['place1']);

    const outcomes = logs.withMsg('Session outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      sessionCode,
      participantCount: 3,
      matchSize: 1,
      nearMissCount: 1,
      restartFollowed: false,
      restartReachedMatch: false,
    });
  });

  it('logs the near miss tier size on an empty match, with no names in the line', async () => {
    await seedSession(['alice', 'bob', 'carol']);
    const logs = captureLogs();

    await sessionService.submitSelections(sessionCode, 'alice', ['place1', 'place2']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place1', 'place3']);
    await sessionService.submitSelections(sessionCode, 'carol', ['place2', 'place3']);

    const outcomes = logs.withMsg('Session outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      sessionCode,
      participantCount: 3,
      matchSize: 0,
      nearMissCount: 3,
      restartFollowed: false,
      restartReachedMatch: false,
    });

    // Anonymous: no display names, participant ids, or restaurant names
    const serialized = JSON.stringify(outcomes[0]);
    for (const leak of ['alice', 'bob', 'carol', 'Pizza', 'Sushi', 'Taco', 'place1']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('logs the near miss tier for a two-participant session', async () => {
    await seedSession(['alice', 'bob']);
    const logs = captureLogs();

    await sessionService.submitSelections(sessionCode, 'alice', ['place1']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place2']);

    const outcomes = logs.withMsg('Session outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      sessionCode,
      participantCount: 2,
      matchSize: 0,
      nearMissCount: 2,
      restartFollowed: false,
      restartReachedMatch: false,
    });
  });

  it('correlates a restart-then-complete with restart fields answering "did Restart rescue it?"', async () => {
    await seedSession(['alice', 'bob']);
    const logs = captureLogs();

    // First outcome: empty match
    await sessionService.submitSelections(sessionCode, 'alice', ['place1']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place2']);

    // Restart, then complete again with overlap
    await sessionService.restartSession(sessionCode, 'alice');
    await sessionService.submitSelections(sessionCode, 'alice', ['place1']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place1']);

    const outcomes = logs.withMsg('Session outcome');
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({
      sessionCode,
      matchSize: 0,
      restartFollowed: false,
      restartReachedMatch: false,
    });
    expect(outcomes[1]).toMatchObject({
      sessionCode,
      matchSize: 1,
      restartFollowed: true,
      restartReachedMatch: true,
    });
  });

  it('emits the outcome line when the last holdout leaving completes the session', async () => {
    await seedSession(['alice', 'bob', 'carol']);
    const logs = captureLogs();

    await sessionService.submitSelections(sessionCode, 'alice', ['place1']);
    await sessionService.submitSelections(sessionCode, 'bob', ['place1']);
    await sessionService.leaveSession(sessionCode, 'carol');

    const outcomes = logs.withMsg('Session outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      sessionCode,
      participantCount: 2,
      matchSize: 1,
      nearMissCount: 0,
      restartFollowed: false,
      restartReachedMatch: false,
    });
  });
});

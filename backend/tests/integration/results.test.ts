import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { sessionStore as store } from '../../src/server.js';
import { startedSession } from '../helpers/startedSession.js';
import type { Restaurant } from '@dinder/shared/types';

// The Match is a real Redis SINTER over each Participant's selections.
describe('Integration Test: Results (FR-009, FR-010, FR-011, FR-016, FR-021)', () => {
  const sessionCode = 'RES12';
  let redis: Redis;

  const restaurants: Restaurant[] = [
    { placeId: 'place1', name: 'Pizza Palace', rating: 4.5, priceLevel: 2 },
    { placeId: 'place2', name: 'Sushi Spot', rating: 4.8, priceLevel: 3 },
    { placeId: 'place3', name: 'Thai Kitchen', rating: 4.2, priceLevel: 2 },
  ];

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    await cleanupTestData(redis);
    await startedSession(store, sessionCode, restaurants);
    await store.addParticipant(sessionCode, {
      participantId: 'alice',
      displayName: 'Alice',
      isHost: true,
    });
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  async function submitWithBob(alice: string[], bob: string[]) {
    await store.addParticipant(sessionCode, { participantId: 'bob', displayName: 'Bob' });
    await store.recordSubmission(sessionCode, 'alice', alice);
    await store.recordSubmission(sessionCode, 'bob', bob);
  }

  it('overlap: stores the shared pick as the Match and reveals every selection', async () => {
    await submitWithBob(['place1', 'place2'], ['place2', 'place3']);

    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual([
      expect.objectContaining({ placeId: 'place2', name: 'Sushi Spot' }),
    ]);
    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual(['place2']);
    expect(results.allSelections).toEqual({
      Alice: expect.arrayContaining(['place1', 'place2']),
      Bob: expect.arrayContaining(['place2', 'place3']),
    });
    expect(results.restaurantNames).toMatchObject({
      place1: 'Pizza Palace',
      place2: 'Sushi Spot',
      place3: 'Thai Kitchen',
    });
  });

  it('no overlap: returns an empty Match and stores the empty results marker', async () => {
    await submitWithBob(['place1'], ['place2']);

    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(false);
    expect(results.overlappingOptions).toEqual([]);
    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual(['__empty__']);
  });

  it('single participant: their selections are the Match', async () => {
    await store.recordSubmission(sessionCode, 'alice', ['place1', 'place2']);

    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ placeId: 'place1' }),
        expect.objectContaining({ placeId: 'place2' }),
      ])
    );
    expect(results.overlappingOptions).toHaveLength(2);
    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual(
      expect.arrayContaining(['place1', 'place2'])
    );
    expect(results.allSelections).toEqual({
      Alice: expect.arrayContaining(['place1', 'place2']),
    });
    expect(results.restaurantNames).toMatchObject({
      place1: 'Pizza Palace',
      place2: 'Sushi Spot',
    });
  });
});

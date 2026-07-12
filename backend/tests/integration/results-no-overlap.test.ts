import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { sessionStore as store } from '../../src/server.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Integration Test: Results with No Overlap (FR-016)', () => {
  const sessionCode = 'NOOVLP';
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
    await store.recordSubmission(sessionCode, 'alice', ['place1']);
    await store.recordSubmission(sessionCode, 'bob', ['place2']);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should return an empty Match', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.overlappingOptions).toEqual([]);
  });

  it('should set hasOverlap to false and store an empty results marker', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(false);

    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual([
      '__empty__',
    ]);
  });
});

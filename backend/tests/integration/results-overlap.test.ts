import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import { sessionStore as store } from '../../src/server.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Integration Test: Results with Overlap (FR-009, FR-010, FR-011)', () => {
  const sessionCode = 'OVR123';
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
    await store.recordSubmission(sessionCode, 'bob', ['place2', 'place3']);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should calculate the Match using Redis SINTER', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual([
      expect.objectContaining({
        placeId: 'place2',
        name: 'Sushi Spot',
      }),
    ]);
  });

  it('should store the Match ids', async () => {
    await store.computeAndStoreResults(sessionCode);

    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual([
      'place2',
    ]);
  });

  it('should reveal all selections and restaurant names after completion', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

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
});

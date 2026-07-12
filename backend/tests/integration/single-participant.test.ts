import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as store from '../../src/store/sessionStore.js';
import type { Restaurant } from '@dinder/shared/types';

describe('Integration Test: Single Participant Session (FR-021)', () => {
  const sessionCode = 'SOLO12';
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
    await store.recordSubmission(sessionCode, 'alice', ['place1', 'place2']);
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should use the single participant selections as the Match', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ placeId: 'place1' }),
        expect.objectContaining({ placeId: 'place2' }),
      ])
    );
  });

  it('should return participant selections as overlapping options', async () => {
    const results = await store.computeAndStoreResults(sessionCode);

    expect(results.allSelections).toEqual({
      Alice: expect.arrayContaining(['place1', 'place2']),
    });
    expect(results.restaurantNames).toMatchObject({
      place1: 'Pizza Palace',
      place2: 'Sushi Spot',
    });
  });
});

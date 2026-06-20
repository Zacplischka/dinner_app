import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as OverlapService from '../../src/services/OverlapService.js';
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
    await ParticipantModel.addParticipant(sessionCode, 'alice', 'Alice', true);
    await ParticipantModel.addParticipant(sessionCode, 'bob', 'Bob');

    await redis.hset(
      `session:${sessionCode}:restaurants`,
      Object.fromEntries(
        restaurants.map((restaurant) => [
          restaurant.placeId,
          JSON.stringify(restaurant),
        ])
      )
    );
    await redis.sadd(`session:${sessionCode}:alice:selections`, 'place1');
    await redis.sadd(`session:${sessionCode}:bob:selections`, 'place2');
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should return empty overlappingOptions array', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    expect(results.overlappingOptions).toEqual([]);
  });

  it('should set hasOverlap to false and store an empty results marker', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    expect(results.hasOverlap).toBe(false);

    await OverlapService.storeResults(sessionCode, []);

    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual([
      '__empty__',
    ]);
  });
});

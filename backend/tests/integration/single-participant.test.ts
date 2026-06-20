import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as OverlapService from '../../src/services/OverlapService.js';
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
    await ParticipantModel.addParticipant(sessionCode, 'alice', 'Alice', true);
    await redis.hset(
      `session:${sessionCode}:restaurants`,
      Object.fromEntries(
        restaurants.map((restaurant) => [
          restaurant.placeId,
          JSON.stringify(restaurant),
        ])
      )
    );
    await redis.sadd(`session:${sessionCode}:alice:selections`, 'place1', 'place2');
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should trigger immediate overlap results from the single participant selections', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ placeId: 'place1' }),
        expect.objectContaining({ placeId: 'place2' }),
      ])
    );
  });

  it('should return participant selections as overlapping options', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    expect(results.allSelections).toEqual({
      Alice: expect.arrayContaining(['place1', 'place2']),
    });
    expect(results.restaurantNames).toMatchObject({
      place1: 'Pizza Palace',
      place2: 'Sushi Spot',
    });
  });
});

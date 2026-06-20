import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis } from '../helpers/testSetup.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as OverlapService from '../../src/services/OverlapService.js';
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
    await ParticipantModel.addParticipant(sessionCode, 'alice', 'Alice', true);
    await ParticipantModel.addParticipant(sessionCode, 'bob', 'Bob');

    await redis.sadd(
      `session:${sessionCode}:restaurant_ids`,
      ...restaurants.map((restaurant) => restaurant.placeId)
    );
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
    await redis.sadd(`session:${sessionCode}:bob:selections`, 'place2', 'place3');
  });

  afterEach(async () => {
    await cleanupTestData(redis);
  });

  it('should calculate overlapping options using Redis SINTER', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    expect(results.hasOverlap).toBe(true);
    expect(results.overlappingOptions).toEqual([
      expect.objectContaining({
        placeId: 'place2',
        name: 'Sushi Spot',
      }),
    ]);
  });

  it('should store overlapping result ids', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

    await OverlapService.storeResults(
      sessionCode,
      results.overlappingOptions.map((option) => option.placeId)
    );

    await expect(redis.smembers(`session:${sessionCode}:results`)).resolves.toEqual([
      'place2',
    ]);
  });

  it('should reveal all selections and restaurant names after completion', async () => {
    const results = await OverlapService.calculateOverlap(sessionCode);

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

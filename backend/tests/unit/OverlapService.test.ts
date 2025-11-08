import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as OverlapService from '../../src/services/OverlapService.js';
import { redis } from '../../src/redis/client.js';

describe('OverlapService', () => {
  const sessionCode = 'TEST12';

  afterEach(async () => {
    await redis.del(`session:${sessionCode}:participants`);
    await redis.del(`session:${sessionCode}:participant1:selections`);
    await redis.del(`session:${sessionCode}:participant2:selections`);
    await redis.del(`session:${sessionCode}:restaurants`);
    await redis.del(`participant:participant1`);
    await redis.del(`participant:participant2`);
  });

  describe('calculateOverlap with Place IDs', () => {
    it('should map overlapping Place IDs to Restaurant objects', async () => {
      // Set up participants
      await redis.sadd(`session:${sessionCode}:participants`, 'participant1', 'participant2');
      await redis.hset(`participant:participant1`, {
        participantId: 'participant1',
        displayName: 'Alice',
        sessionCode,
        isHost: '1',
      });
      await redis.hset(`participant:participant2`, {
        participantId: 'participant2',
        displayName: 'Bob',
        sessionCode,
        isHost: '0',
      });

      // Set up selections
      await redis.sadd(`session:${sessionCode}:participant1:selections`, 'place1', 'place2');
      await redis.sadd(`session:${sessionCode}:participant2:selections`, 'place2', 'place3');

      // Set up restaurant data
      const restaurant2 = {
        placeId: 'place2',
        name: 'Overlapping Restaurant',
        rating: 4.5,
        priceLevel: 2,
      };

      await redis.hset(
        `session:${sessionCode}:restaurants`,
        'place2',
        JSON.stringify(restaurant2)
      );

      const result = await OverlapService.calculateOverlap(sessionCode);

      expect(result.overlappingOptions).toHaveLength(1);
      expect(result.overlappingOptions[0]).toEqual(restaurant2);
    });

    it('should handle missing restaurant data gracefully', async () => {
      // Set up participants
      await redis.sadd(`session:${sessionCode}:participants`, 'participant1', 'participant2');
      await redis.hset(`participant:participant1`, {
        participantId: 'participant1',
        displayName: 'Alice',
        sessionCode,
        isHost: '1',
      });
      await redis.hset(`participant:participant2`, {
        participantId: 'participant2',
        displayName: 'Bob',
        sessionCode,
        isHost: '0',
      });

      await redis.sadd(`session:${sessionCode}:participant1:selections`, 'place1');
      await redis.sadd(`session:${sessionCode}:participant2:selections`, 'place1');

      // No restaurant data in Redis

      const result = await OverlapService.calculateOverlap(sessionCode);

      expect(result.overlappingOptions).toEqual([]);
    });

    it('should return all selections with Place IDs', async () => {
      // Set up participants
      await redis.sadd(`session:${sessionCode}:participants`, 'participant1');
      await redis.hset(`participant:participant1`, {
        participantId: 'participant1',
        displayName: 'Alice',
        sessionCode,
        isHost: '1',
      });

      await redis.sadd(`session:${sessionCode}:participant1:selections`, 'place1', 'place2');

      const restaurant1 = {
        placeId: 'place1',
        name: 'Restaurant 1',
        rating: 4.5,
        priceLevel: 2,
      };

      await redis.hset(
        `session:${sessionCode}:restaurants`,
        'place1',
        JSON.stringify(restaurant1)
      );

      const result = await OverlapService.calculateOverlap(sessionCode);

      expect(result.allSelections['Alice']).toContain('place1');
      expect(result.allSelections['Alice']).toContain('place2');
    });
  });
});

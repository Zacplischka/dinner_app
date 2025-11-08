import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as SelectionService from '../../src/services/SelectionService.js';
import { redis } from '../../src/redis/client.js';

describe('SelectionService', () => {
  const sessionCode = 'TEST12';
  const participantId = 'participant-123';

  afterEach(async () => {
    await redis.del(`session:${sessionCode}:restaurant_ids`);
    await redis.del(`session:${sessionCode}:${participantId}:selections`);
  });

  describe('submitSelections with Place IDs', () => {
    it('should validate Place IDs against session restaurants', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1', 'place2');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1', 'place2'])
      ).resolves.not.toThrow();
    });

    it('should reject invalid Place IDs', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1', 'invalid'])
      ).rejects.toThrow('INVALID_RESTAURANTS');
    });

    it('should store Place IDs in selections set', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1', 'place2');

      await SelectionService.submitSelections(sessionCode, participantId, ['place1', 'place2']);

      const selections = await redis.smembers(`session:${sessionCode}:${participantId}:selections`);
      expect(selections).toContain('place1');
      expect(selections).toContain('place2');
    });

    it('should reject empty selections', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, [])
      ).rejects.toThrow('INVALID_RESTAURANTS');
    });

    it('should reject if participant already submitted', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');
      await redis.sadd(`session:${sessionCode}:${participantId}:selections`, 'place1');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1'])
      ).rejects.toThrow('ALREADY_SUBMITTED');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as SelectionService from '../../src/services/SelectionService.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import { redis } from '../../src/redis/client.js';

describe('SelectionService', () => {
  const sessionCode = 'TEST12';
  const participantId = 'participant-123';

  afterEach(async () => {
    await redis.del(`session:${sessionCode}:restaurant_ids`);
    await redis.del(`session:${sessionCode}:${participantId}:selections`);
    await redis.del(`session:${sessionCode}:participants`);
    await redis.del(`participant:${participantId}`);
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

    it('should allow empty selections', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, [])
      ).resolves.not.toThrow();

      const selections = await redis.smembers(`session:${sessionCode}:${participantId}:selections`);
      expect(selections).toEqual([]);
    });

    it('should reject if participant already submitted', async () => {
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');
      await ParticipantModel.addParticipant(sessionCode, participantId, 'Bob');
      await ParticipantModel.markParticipantSubmitted(participantId);

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1'])
      ).rejects.toThrow('ALREADY_SUBMITTED');
    });
  });
});

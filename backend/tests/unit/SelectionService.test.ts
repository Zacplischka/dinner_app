import { describe, it, expect, afterEach, vi } from 'vitest';
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
    vi.restoreAllMocks();
  });

  describe('submitSelections with Place IDs', () => {
    it('should validate Place IDs against session restaurants', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1', 'place2');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1', 'place2'])
      ).resolves.not.toThrow();

      expect(logSpy).toHaveBeenCalledWith('Selections submitted', {
        sessionCode,
        participantId,
        selectionCount: 2,
      });
    });

    it('should reject invalid Place IDs', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1', 'invalid'])
      ).rejects.toThrow('INVALID_RESTAURANTS');

      expect(warnSpy).toHaveBeenCalledWith('Rejected selections with invalid restaurants', {
        sessionCode,
        participantId,
        invalidCount: 1,
      });
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
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await redis.sadd(`session:${sessionCode}:restaurant_ids`, 'place1');
      await ParticipantModel.addParticipant(sessionCode, participantId, 'Bob');
      await ParticipantModel.markParticipantSubmitted(participantId);

      await expect(
        SelectionService.submitSelections(sessionCode, participantId, ['place1'])
      ).rejects.toThrow('ALREADY_SUBMITTED');

      expect(warnSpy).toHaveBeenCalledWith('Rejected duplicate selection submission', {
        sessionCode,
        participantId,
      });
    });
  });

  describe('clearSelections', () => {
    it('should log how many participant selection sets were cleared', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await ParticipantModel.addParticipant(sessionCode, participantId, 'Bob');
      await redis.sadd(`session:${sessionCode}:${participantId}:selections`, 'place1');

      await SelectionService.clearSelections(sessionCode);

      expect(logSpy).toHaveBeenCalledWith('Session selections cleared', {
        sessionCode,
        participantCount: 1,
      });
    });
  });
});

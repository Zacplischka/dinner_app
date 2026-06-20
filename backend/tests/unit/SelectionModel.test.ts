import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redis } from '../../src/redis/client.js';
import * as SelectionModel from '../../src/models/Selection.js';

describe('Selection model', () => {
  const sessionCode = 'SELMOD';

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  async function cleanup() {
    const keys = await redis.keys(`session:${sessionCode}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  it('should return all selections keyed by participant id', async () => {
    await SelectionModel.submitSelections(sessionCode, 'alice', ['place1', 'place2']);
    await SelectionModel.submitSelections(sessionCode, 'bob', ['place2']);

    const selections = await SelectionModel.getAllSelections(sessionCode, ['alice', 'bob']);

    expect(selections).toEqual({
      alice: expect.arrayContaining(['place1', 'place2']),
      bob: ['place2'],
    });
  });

  it('should report whether a participant has submitted selections', async () => {
    await expect(SelectionModel.hasSubmitted(sessionCode, 'alice')).resolves.toBe(false);

    await SelectionModel.submitSelections(sessionCode, 'alice', ['place1']);

    await expect(SelectionModel.hasSubmitted(sessionCode, 'alice')).resolves.toBe(true);
  });

  it('should count participants with stored selections', async () => {
    await SelectionModel.submitSelections(sessionCode, 'alice', ['place1']);
    await SelectionModel.submitSelections(sessionCode, 'charlie', ['place2']);

    await expect(
      SelectionModel.getSubmittedCount(sessionCode, ['alice', 'bob', 'charlie'])
    ).resolves.toBe(2);
  });

  it('should clear selections for a specific participant', async () => {
    await SelectionModel.submitSelections(sessionCode, 'alice', ['place1']);

    await SelectionModel.clearSelections(sessionCode, 'alice');

    await expect(SelectionModel.getSelections(sessionCode, 'alice')).resolves.toEqual([]);
  });

  it('should clear selections and results for all participants', async () => {
    await SelectionModel.submitSelections(sessionCode, 'alice', ['place1']);
    await SelectionModel.submitSelections(sessionCode, 'bob', ['place2']);
    await redis.sadd(`session:${sessionCode}:results`, 'place1');

    await SelectionModel.clearAllSelections(sessionCode, ['alice', 'bob']);

    await expect(redis.exists(`session:${sessionCode}:alice:selections`)).resolves.toBe(0);
    await expect(redis.exists(`session:${sessionCode}:bob:selections`)).resolves.toBe(0);
    await expect(redis.exists(`session:${sessionCode}:results`)).resolves.toBe(0);
  });
});

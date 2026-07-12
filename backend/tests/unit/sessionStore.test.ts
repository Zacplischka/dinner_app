// SessionStore unit tests - exercised through the store's interface against real Redis.
// Replaces the per-layer Session/SelectionService/OverlapService suites.

import { describe, it, expect, afterEach } from 'vitest';
import * as store from '../../src/store/sessionStore.js';
import { redis } from '../../src/redis/client.js';
import type { Restaurant } from '@dinder/shared/types';

const sessionCode = 'TEST12';

const restaurants: Restaurant[] = [
  { placeId: 'place1', name: 'Restaurant 1', rating: 4.5, priceLevel: 2 } as Restaurant,
  { placeId: 'place2', name: 'Restaurant 2', rating: 4.2, priceLevel: 3 } as Restaurant,
  { placeId: 'place3', name: 'Restaurant 3', rating: 3.9, priceLevel: 1 } as Restaurant,
];

async function createTestSession(withRestaurants = true) {
  return await store.createSession(sessionCode, {
    hostId: 'host-1',
    hostName: 'Alice',
    restaurants: withRestaurants ? restaurants : undefined,
  });
}

afterEach(async () => {
  await store.deleteSession(sessionCode);
});

describe('SessionStore', () => {
  describe('createSession / readSession', () => {
    it('round-trips session metadata', async () => {
      const location = { latitude: 37.7749, longitude: -122.4194, address: 'San Francisco, CA' };
      await store.createSession(sessionCode, {
        hostId: 'host-1',
        hostName: 'Alice',
        location,
        searchRadiusMiles: 5,
      });

      const session = await store.readSession(sessionCode);
      expect(session?.sessionCode).toBe(sessionCode);
      expect(session?.hostId).toBe('host-1');
      expect(session?.hostName).toBe('Alice');
      expect(session?.state).toBe('waiting');
      expect(session?.participantCount).toBe(1);
      expect(session?.location).toEqual(location);
      expect(session?.searchRadiusMiles).toBe(5);
    });

    it('omits location when not provided', async () => {
      await createTestSession(false);
      const session = await store.readSession(sessionCode);
      expect(session?.location).toBeUndefined();
      expect(session?.searchRadiusMiles).toBeUndefined();
    });

    it('returns null for a non-existent session', async () => {
      expect(await store.readSession('NONEXIST')).toBeNull();
    });

    it('sets a TTL on every session key, restaurants included', async () => {
      await createTestSession();
      for (const key of [
        `session:${sessionCode}`,
        `session:${sessionCode}:restaurant_ids`,
        `session:${sessionCode}:restaurants`,
      ]) {
        const ttl = await redis.ttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(store.SESSION_TTL_SECONDS);
      }
    });
  });

  describe('participants', () => {
    it('adds, lists, and counts participants', async () => {
      await createTestSession();
      const count1 = await store.addParticipant(sessionCode, {
        participantId: 'p1',
        displayName: 'Alice',
        isHost: true,
      });
      const count2 = await store.addParticipant(sessionCode, {
        participantId: 'p2',
        displayName: 'Bob',
      });

      expect(count1).toBe(1);
      expect(count2).toBe(2);
      expect(await store.countParticipants(sessionCode)).toBe(2);
      expect(await store.isParticipant(sessionCode, 'p1')).toBe(true);
      expect(await store.isParticipant(sessionCode, 'nope')).toBe(false);

      const participants = await store.listParticipants(sessionCode);
      expect(participants).toHaveLength(2);
      expect(participants.find((p) => p.participantId === 'p1')?.isHost).toBe(true);
      expect(participants.find((p) => p.participantId === 'p2')?.hasSubmitted).toBe(false);
    });

    it('removes a participant along with their selections', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);

      const remaining = await store.removeParticipant(sessionCode, 'p1');

      expect(remaining).toBe(0);
      expect(await store.getParticipant('p1')).toBeNull();
      expect(await redis.exists(`session:${sessionCode}:p1:selections`)).toBe(0);
    });
  });

  describe('recordSubmission', () => {
    it('stores selections and marks the participant submitted', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });

      const result = await store.recordSubmission(sessionCode, 'p1', ['place1', 'place2']);

      expect(result).toEqual({ submittedCount: 1, participantCount: 2 });
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(true);
    });

    it('allows an empty Submission - submitted is a fact about the participant', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });

      const result = await store.recordSubmission(sessionCode, 'p1', []);

      expect(result).toEqual({ submittedCount: 1, participantCount: 1 });
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(true);
    });

    it('rejects a second Submission', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', []);

      await expect(store.recordSubmission(sessionCode, 'p1', ['place1'])).rejects.toThrow(
        'ALREADY_SUBMITTED'
      );
    });

    it('rejects selections outside the session restaurant list', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });

      await expect(
        store.recordSubmission(sessionCode, 'p1', ['place1', 'bogus'])
      ).rejects.toThrow('INVALID_RESTAURANTS');
    });
  });

  describe('computeAndStoreResults', () => {
    it('returns empty results for a session with no participants', async () => {
      await createTestSession();
      const result = await store.computeAndStoreResults(sessionCode);
      expect(result).toEqual({
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
      });
    });

    it('computes the Match as the intersection of all Submissions', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'p1', ['place1', 'place2']);
      await store.recordSubmission(sessionCode, 'p2', ['place2', 'place3']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(true);
      expect(result.overlappingOptions).toHaveLength(1);
      expect(result.overlappingOptions[0].placeId).toBe('place2');
      expect(result.allSelections['Alice']).toEqual(
        expect.arrayContaining(['place1', 'place2'])
      );
      expect(result.restaurantNames['place3']).toBe('Restaurant 3');
    });

    it("uses a single participant's selections as the Match (FR-021)", async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(true);
      expect(result.overlappingOptions.map((r) => r.placeId)).toEqual(['place1']);
    });

    it('reports no overlap when Submissions are disjoint', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.recordSubmission(sessionCode, 'p2', ['place3']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(false);
      expect(result.overlappingOptions).toEqual([]);
    });
  });

  describe('resetForRestart', () => {
    it('wipes Selections, Submissions, and the Match; back to selecting', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.computeAndStoreResults(sessionCode);
      await store.updateState(sessionCode, 'complete');

      await store.resetForRestart(sessionCode);

      expect((await store.readSession(sessionCode))?.state).toBe('selecting');
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(false);
      expect(await redis.exists(`session:${sessionCode}:p1:selections`)).toBe(0);
      expect(await redis.exists(`session:${sessionCode}:results`)).toBe(0);

      // A fresh Submission is accepted after Restart
      const result = await store.recordSubmission(sessionCode, 'p1', ['place2']);
      expect(result.submittedCount).toBe(1);
    });
  });

  describe('restaurants', () => {
    it('round-trips the session restaurant list', async () => {
      await createTestSession();
      const { restaurants: list, missingCount } = await store.getRestaurants(sessionCode);
      expect(list.map((r) => r.placeId).sort()).toEqual(['place1', 'place2', 'place3']);
      expect(missingCount).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('removes every key belonging to the session', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.computeAndStoreResults(sessionCode);

      await store.deleteSession(sessionCode);

      const leftovers = await redis.keys(`session:${sessionCode}*`);
      expect(leftovers).toEqual([]);
      expect(await store.getParticipant('p1')).toBeNull();
    });
  });

  describe('sessionCodeFromExpiredKey', () => {
    it('extracts the code from a root session key', () => {
      expect(store.sessionCodeFromExpiredKey('session:ABC123')).toBe('ABC123');
    });

    it('ignores sub-keys and unrelated keys', () => {
      expect(store.sessionCodeFromExpiredKey('session:ABC123:results')).toBeNull();
      expect(store.sessionCodeFromExpiredKey('participant:xyz')).toBeNull();
    });
  });
});
